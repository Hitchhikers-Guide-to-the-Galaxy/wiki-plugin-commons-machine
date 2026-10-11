import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Q } from '../src/core/rational.js'
import { parse, evaluate, plan } from '../src/core/expr.js'
import { FORMULAS, KEY_TO_LABEL, MANIFEST } from '../src/core/bundle.js'
import { declarationsOf, classify, resolve } from '../src/core/declare.js'
import { compute, breakEven, contributionForMargin, sweeps, parseBenchmarks, cloudComparison, provenanceBundle, hashBundle, envFrom, missingInputs } from '../src/core/machine.js'
import { scenarioPage } from '../src/core/scenario.js'

const expected = JSON.parse(fs.readFileSync(new URL('./expected.json', import.meta.url)))
const PAGES = process.env.PAGES || `${process.env.HOME}/Nextcloud/fedwiki/model.fedwiki.club/pages`
const page = slug => ({ ...JSON.parse(fs.readFileSync(`${PAGES}/${slug}`)), slug })
const LINEUP = ['compute-rig', 'membership-covenant', 'operating-costs', 'demand-profile', 'cloud-benchmarks', 'commons-policy']
const lineup = (extra = []) => [...LINEUP, ...extra].map(s => ({ page: page(s), site: 'model.fedwiki.club' }))
const near = (a, b, tol = '0.000001') => assert.ok(Q.from(a).sub(Q.from(b)).cmp(0) <= 0 ? Q.from(b).sub(Q.from(a)).le(Q.parse(tol)) : Q.from(a).sub(Q.from(b)).le(Q.parse(tol)), `${a} vs ${b}`)

describe('rational', () => {
  it('parses decimals exactly', () => { assert.equal(Q.parse('0.2611').toFixed(4), '0.2611'); assert.equal(Q.parse('5499').div(36).toFixed(2), '152.75') })
  it('rounds half up at display', () => { assert.equal(Q.parse('2.345').toFixed(2), '2.35'); assert.equal(Q.parse('-1.005').toFixed(2), '-1.01') })
})
describe('expressions', () => {
  it('parses precedence and calls without eval', () => { assert.equal(evaluate(parse('1 + 2 * 3 - max(0, -4) / 2'), {}).toString(), '7') })
  it('reports a missing input by name', () => { assert.throws(() => evaluate(parse('a.b * 2'), {}), /missing input: a.b/) })
  it('orders the bundle and lists its inputs', () => { const p = plan(FORMULAS); assert.ok(p.order.indexOf('surplus_gbp_month') > p.order.indexOf('fully_loaded_cost_gbp_month')); assert.ok(p.inputs.includes('rig.capital_gbp')) })
  it('detects a cycle', () => { assert.throws(() => plan({ a: 'b + 1', b: 'a * 2' }), /cycle/) })
})
describe('declarations and roles', () => {
  it('reads typed facts with provenance off a Method item', () => {
    const d = declarationsOf(page('compute-rig'), 'model.fedwiki.club')
    const cap = d.find(x => x.key === 'rig.capital_gbp'); assert.equal(cap.value.toString(), '5499'); assert.equal(cap.label, 'Capital (GBP)'); assert.ok(cap.item && cap.revision)
  })
  it('classifies pages by what they declare', () => {
    assert.equal(classify(page('compute-rig')).role, 'compute-rig'); assert.equal(classify(page('demand-profile')).role, 'demand-profile')
    assert.equal(classify(page('cloud-benchmarks')).role, 'cloud-benchmarks'); assert.equal(classify(page('scenario-overrides')).role, 'scenario-overrides')
    assert.equal(classify(page('welcome-visitors')).role, null)
  })
  it('resolves the full lineup with no errors', () => { const r = resolve(lineup()); assert.deepEqual(r.errors, []); assert.equal(Object.keys(r.facts).length, 25) })
  it('errors on a missing required role', () => { const r = resolve(lineup().filter(p => p.page.slug !== 'membership-covenant')); assert.ok(r.errors.some(e => /missing required role membership-covenant/.test(e))) })
  it('errors on a duplicate role and a duplicate key', () => { const r = resolve([...lineup(), { page: page('compute-rig'), site: 'x' }]); assert.ok(r.errors.some(e => /role compute-rig filled 2/.test(e))); assert.ok(r.errors.some(e => /duplicate rig.capital_gbp/.test(e))) })
  it('lists every shadowed value from an overrides page', () => {
    const r = resolve(lineup(['scenario-overrides'])); assert.deepEqual(r.errors, [])
    assert.equal(r.shadowed.length, 3); const cap = r.shadowed.find(s => s.key === 'rig.capital_gbp'); assert.equal(cap.from.toString(), '5499'); assert.equal(cap.to.toString(), '15999')
    assert.equal(r.facts['rig.capital_gbp'].shadows.title, 'Compute Rig')
  })
})
describe('machine against the decimal fixtures', () => {
  const base = envFrom(resolve(lineup()).facts)
  const check = (env, c) => { const r = compute(env); for (const [k, v] of Object.entries(c.expected)) if (r[k]) near(r[k], v) }
  it('has every input the bundle needs', () => assert.deepEqual(missingInputs(base), []))
  it('reproduces the baseline exactly', () => { const c = expected.cases.find(c => c.name === 'baseline'); check(base, c); assert.equal(compute(base).surplus_gbp_month.toFixed(7), '164.2185552') })
  it('reproduces all twenty cases', () => { for (const c of expected.cases) check({ ...base, ...Object.fromEntries(Object.entries(c.overrides).map(([k, v]) => [k, Q.parse(v)])) }, c) })
  it('finds break-even by search', () => { assert.equal(breakEven(base), 33); assert.equal(breakEven({ ...base, 'rig.capital_gbp': Q.from(15999), 'membership.contribution_gbp_month': Q.from(28) }), 34) })
  it('finds the contribution for a 15% margin', () => { near(contributionForMargin({ ...base, 'rig.capital_gbp': Q.from(15999), 'membership.contribution_gbp_month': Q.from(28) }, '0.15'), '26.5176571', '0.0001') })
  it('refuses a surplus when the covenant is unmet', () => {
    const s = sweeps(base); const up = s.find(x => x.key === 'rig.uptime_fraction')
    assert.equal(up.rows[0].refused, true); assert.equal(up.rows[2].refused, false)
    const m = s.find(x => x.key === 'membership.count'); assert.equal(m.rows.find(r => r.value.eq(44)).refused, true); assert.equal(m.rows.find(r => r.value.eq(43)).refused, false)
    assert.equal(compute(base).ceiling_members, 43n)
  })
  it('does not refuse when policy says entitlement need not fit', () => { const r = compute({ ...base, 'rig.uptime_fraction': Q.parse('0.7'), 'policy.entitlement_must_fit_sellable_capacity': Q.from(0) }); assert.equal(r.covenant_refused, false); assert.equal(r.covenant_unmet, true) })
})
describe('cloud benchmarks', () => {
  const today = new Date('2026-09-05T12:00:00Z')
  it('parses rows, rate, VAT and the observation date', () => {
    const b = parseBenchmarks(page('cloud-benchmarks'), today); assert.deepEqual(b.errors, []); assert.equal(b.observed, '2026-09-05'); assert.equal(b.rows.length, 8)
    const r = b.rows.find(r => r.gpu === 'RTX PRO 6000'); assert.equal(r.gbpHour.toFixed(2), '1.86'); assert.equal(r.memoryClass, '96GB-class')
  })
  it('warns past 35 days and refuses past 90', () => {
    assert.ok(parseBenchmarks(page('cloud-benchmarks'), new Date('2026-10-20')).warnings.length); const old = parseBenchmarks(page('cloud-benchmarks'), new Date('2026-12-20')); assert.ok(old.errors.length && old.rows.length === 0)
  })
  it('puts the co-op between two clouds', () => {
    const base = envFrom(resolve(lineup()).facts); const c = cloudComparison(compute(base), base, [page('cloud-benchmarks')], today)
    assert.equal(c.coop.price.toFixed(2), '1.53'); const g = c.rows.find(r => r.gpu === 'RTX 5090'); assert.ok(g.ratio.gt(1)); const p = c.rows.find(r => r.gpu === 'RTX PRO 6000'); assert.ok(p.ratio.lt(1))
  })
})
describe('provenance and the ghost page', () => {
  it('hashes a bundle deterministically', async () => {
    const r = resolve(lineup()); const b = provenanceBundle(r.facts, {}); const h1 = await hashBundle(b); const h2 = await hashBundle(provenanceBundle(r.facts, {}))
    assert.equal(h1, h2); assert.equal(h1.length, 64); assert.notEqual(h1, await hashBundle(provenanceBundle(r.facts, { 'membership.count': 36 })))
  })
  it('emits a scenario page with results, costs, inputs and provenance', async () => {
    const r = resolve(lineup(['scenario-overrides'])); const env = envFrom(r.facts); const res = compute(env)
    const p = scenarioPage({ result: res, env, facts: r.facts, shadowed: r.shadowed, controls: {}, warnings: [], hash: 'abc', computedAt: '2026-09-05', site: 'model.fedwiki.club' })
    assert.equal(p.title, 'Scenario 42 members at £28 512GB'); assert.equal(p.story.filter(i => i.type === 'table').length, 2)
    assert.ok(p.story.some(i => /Overrides in force/.test(i.text) && /5499 → 15999/.test(i.text))); assert.ok(p.journal[0].provenance)
  })
})

// The verb: evaluate the bundle over resolved facts, then everything Method cannot
// do — break-even by search, sweeps, the covenant refusal, cloud classes with
// freshness, and the provenance bundle with its hash.
import { FORMULAS, FORMULA_VERSION, MANIFEST, KEY_TO_LABEL } from './bundle.js'
import { plan, run } from './expr.js'
import { Q } from './rational.js'

export const PLANNED = plan(FORMULAS)

export const envFrom = (facts, extra = {}) => {
  const env = {}
  for (const [k, f] of Object.entries(facts)) env[k] = f.value
  for (const [k, v] of Object.entries(extra)) env[k] = Q.from(v)
  return env
}

export const missingInputs = env => PLANNED.inputs.filter(k => !(k in env) && k !== 'policy.target_surplus_margin' && k !== 'policy.entitlement_must_fit_sellable_capacity')

export const compute = env => {
  const missing = missingInputs(env)
  if (missing.length) throw new Error(`missing inputs: ${missing.map(k => KEY_TO_LABEL[k] || k).join(', ')}`)
  const r = run(PLANNED, env)
  const mustFit = !env['policy.entitlement_must_fit_sellable_capacity'] || !Q.from(env['policy.entitlement_must_fit_sellable_capacity']).isZero()
  r.covenant_unmet = r.guaranteed_entitlement_hours.gt(r.sellable_hours_month)
  r.covenant_refused = mustFit && r.covenant_unmet
  r.ceiling_members = r.sellable_hours_month.div(env['membership.guaranteed_hours_member_month']).floor()
  return r
}

export const breakEven = env => {
  for (let n = 1; n <= 1000; n++) {
    const r = compute({ ...env, 'membership.count': Q.from(n) })
    if (r.surplus_gbp_month.ge(0)) return n
  }
  return null
}
export const contributionForMargin = (env, margin) => {
  const r = compute(env)
  const costEx = r.fully_loaded_cost_gbp_month.sub(r.payment_fees_gbp_month).add(r.covenant_credit_gbp_month)
  return costEx.div(Q.from(1).sub(Q.from(margin)).sub(env['operations.payment_fee_fraction_revenue'])).div(env['membership.count'])
}

// A sweep row refuses to report a surplus when the covenant is unmet and policy says it must fit.
export const sweep = (env, key, values) => values.map(v => {
  const r = compute({ ...env, [key]: Q.from(v) })
  return { value: Q.from(v), result: r, refused: r.covenant_refused }
})
export const sweeps = (env, manifest = MANIFEST) => manifest.sweeps.map(s => ({ key: s.key, label: KEY_TO_LABEL[s.key] || s.key, rows: sweep(env, s.key, s.values) }))

// ---- cloud benchmarks: a table item with Provider | GPU | Memory GB | Secure USD/h | Community USD/h ...
export const parseBenchmarks = (page, today = new Date()) => {
  const out = { title: page.title, rows: [], errors: [], warnings: [] }
  const item = (page.story || []).find(i => i.type === 'table' && /USD\/h/i.test(i.text || ''))
  if (!item) { out.errors.push(`${page.title}: no benchmark table`); return out }
  const text = item.text || ''
  const cap = (text.match(/^CAPTION (.*)$/m) || [])[1] || ''
  const observed = (cap.match(/observed (\d{4}-\d{2}-\d{2})/) || [])[1]
  const rate = (cap.match(/\$([\d.]+) per £/) || [])[1]
  const vat = (cap.match(/VAT (\d+)%/) || [])[1]
  if (!observed) out.errors.push(`${page.title}: caption carries no "observed YYYY-MM-DD"`)
  if (!rate) out.errors.push(`${page.title}: caption carries no "$x per £" rate`)
  const days = observed ? Math.floor((today - new Date(observed + 'T00:00:00Z')) / 86400000) : null
  out.observed = observed; out.days = days; out.rate = rate ? Q.parse(rate) : null; out.vat = vat ? Q.parse(vat).div(100) : Q.from(0)
  if (days !== null && days > MANIFEST.freshness.refuse_days) out.errors.push(`${page.title}: observed ${days} days ago, over ${MANIFEST.freshness.refuse_days}; refused`)
  else if (days !== null && days > MANIFEST.freshness.warn_days) out.warnings.push(`${page.title}: observed ${days} days ago`)
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 3 || out.errors.length) return out
  const cols = lines[0].split('|').slice(1, -1).map(s => s.trim())
  const ci = name => cols.findIndex(c => c.toLowerCase() === name.toLowerCase())
  const iP = ci('Provider'), iG = ci('GPU'), iM = ci('Memory GB'), iS = ci('Secure USD/h'), iC = ci('Community USD/h')
  for (const l of lines.slice(2)) {
    const cells = l.split('|').slice(1, -1).map(s => s.trim())
    if (cells.length < cols.length) continue
    try {
      const usd = Q.parse(cells[iS]); const gbp = usd.div(out.rate).mul(Q.from(1).add(out.vat))
      const row = { provider: cells[iP], gpu: cells[iG], memory: Q.parse(cells[iM]), usd, community: iC >= 0 && cells[iC] ? Q.parse(cells[iC]) : null, gbpHour: gbp, source: page.title }
      row.memoryClass = row.memory.le(48) ? 'consumer' : row.memory.le(100) ? '96GB-class' : row.memory.le(300) ? 'large single' : 'multi-GPU'
      out.rows.push(row)
    } catch (e) { out.warnings.push(`${page.title}: skipped row ${cells[iG] || '?'}: ${e.message}`) }
  }
  return out
}
export const cloudComparison = (result, env, benchmarkPages, today) => {
  const parsed = benchmarkPages.map(p => parseBenchmarks(p, today))
  const rows = parsed.flatMap(p => p.rows)
  const mem = env['rig.memory_gb'] ? Q.from(env['rig.memory_gb']) : null
  const coop = { price: result.price_per_expected_hour_gbp, cost: result.cost_per_expected_hour_gbp, memory: mem }
  for (const r of rows) { r.competes = mem ? r.memory.ge(mem.mul(Q.from('0.5'))) : true; r.ratio = r.gbpHour.isZero() ? null : coop.price.div(r.gbpHour) }
  return { pages: parsed, rows, coop, errors: parsed.flatMap(p => p.errors), warnings: parsed.flatMap(p => p.warnings) }
}

// ---- provenance
const canonical = o => JSON.stringify(o, Object.keys(o).sort ? undefined : undefined)
export const provenanceBundle = (facts, overrides, formulaVersion = FORMULA_VERSION) => {
  const inputs = Object.keys(facts).sort().map(k => { const f = facts[k]; return { key: k, value: f.value.toString(), site: f.site, slug: f.slug, item: f.item, revision: f.revision } })
  const extra = Object.keys(overrides || {}).sort().map(k => ({ key: k, value: Q.from(overrides[k]).toString(), source: 'control' }))
  return { formula_version: formulaVersion, inputs, controls: extra }
}
export const hashBundle = async bundle => {
  const text = JSON.stringify(bundle)
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto.subtle
  const digest = await subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

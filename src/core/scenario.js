// The result as a page: a ghost the reader forks to keep. Static items only —
// markdown, a table — so the scenario stays legible on any site.
import { OUTPUTS, COST_LINES, FORMULA_VERSION } from './bundle.js'
import { Q } from './rational.js'
const id = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
export const fmt = (q, unit, places) => unit === '%' ? Q.from(q).mul(100).toFixed(places) + '%' : (unit === '£' ? '£' : '') + Q.from(q).toFixed(places) + (unit === 'h' ? ' h' : '')

export const scenarioPage = ({ result, env, facts, shadowed, controls, warnings, hash, computedAt, site }) => {
  const members = Q.from(env['membership.count']).toString(), fee = Q.from(env['membership.contribution_gbp_month']).toString()
  const mem = env['rig.memory_gb'] ? Q.from(env['rig.memory_gb']).toString() + 'GB' : ''
  const title = `Scenario ${members} members at £${fee}${mem ? ' ' + mem : ''}`
  const verdict = result.covenant_refused ? 'The covenant is unmet: guaranteed entitlement exceeds sellable hours, so no surplus is reported.'
    : result.surplus_gbp_month.ge(0) ? `Viable: surplus ${fmt(result.surplus_gbp_month, '£', 2)} a month, margin ${fmt(result.surplus_margin, '%', 1)}.` : `Not viable: shortfall ${fmt(result.surplus_gbp_month.neg(), '£', 2)} a month.`
  const rows = OUTPUTS.map(([k, label, unit, places]) => [label, result.covenant_refused && k.startsWith('surplus') ? 'refused' : fmt(result[k], unit, places)])
  const table = ['CAPTION Results, formula bundle ' + FORMULA_VERSION, 'LAYOUT table', '', '| Output | Value |', '|---|---|', ...rows.map(r => `| ${r[0]} | ${r[1]} |`)].join('\n')
  const costs = ['CAPTION Sources and uses', 'LAYOUT table', '', '| Line | £ / month |', '|---|---|', `| Revenue | ${result.revenue_gbp_month.toFixed(2)} |`,
    ...COST_LINES.map(([k, l]) => `| ${l} | -${result[k].toFixed(2)} |`), `| Surplus | ${result.surplus_gbp_month.toFixed(2)} |`].join('\n')
  const inputs = Object.keys(facts).sort().map(k => { const f = facts[k]; return `- ${k} = ${f.value.toString()} from [[${f.title}]]${f.site ? ' on ' + f.site : ''}, item ${f.item}${f.revision ? ', revision ' + new Date(f.revision).toISOString().slice(0, 10) : ''}${f.shadows ? ` (shadows ${f.shadows.value.toString()} from [[${f.shadows.title}]])` : ''}` })
  const ctl = Object.entries(controls || {}).map(([k, v]) => `- ${k} = ${Q.from(v).toString()} set by a control, unsaved on any page`)
  const story = [
    { type: 'markdown', id: id(), text: `${verdict} Computed by the Commons Machine from the pages named below on ${computedAt}. Fork this page to keep it; until then it is a ghost.` },
    { type: 'table', id: id(), text: table },
    { type: 'table', id: id(), text: costs },
    { type: 'markdown', id: id(), text: `## Inputs\n\n${inputs.join('\n')}${ctl.length ? '\n\n## Controls\n\n' + ctl.join('\n') : ''}` },
    ...(shadowed && shadowed.length ? [{ type: 'markdown', id: id(), text: '## Overrides in force\n\n' + shadowed.map(s => `- ${s.key}: ${s.from ? s.from.toString() : 'undeclared'} → ${s.to.toString()} by [[${s.page}]]`).join('\n') }] : []),
    ...(warnings && warnings.length ? [{ type: 'markdown', id: id(), text: '## Warnings\n\n' + warnings.map(w => `- ${w}`).join('\n') }] : []),
    { type: 'markdown', id: id(), text: `## Provenance\n\nFormula bundle ${FORMULA_VERSION}. Resolved-input hash \`${hash}\`. Another client with the same page revisions and bundle version obtains the same result.\n\n# See\n\n[[Compute Commons Machine]] · [[Compute Commons Plan]]` },
  ]
  return { title, story, journal: [{ type: 'create', item: { title, story }, date: Date.now(), provenance: 'Emitted by the Commons Machine plugin from the lineup; unsaved until forked.' }] }
}

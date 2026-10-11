// Read declarations off wiki pages: Method value lines become typed facts with
// provenance; pages are classified into manifest roles by what they declare;
// the scope is checked against the manifest (cardinality, duplicates, overrides).
import { ROLES, LABEL_TO_KEY, ROLE_OF_KEY, MANIFEST } from './bundle.js'
import { Q } from './rational.js'

const VALUE_LINE = /^([0-9.eE-]+) +([\w .%(){},&*/+-]+)$/

export const declarationsOf = (page, site) => {
  const out = []
  const rev = page.journal && page.journal.length ? page.journal[page.journal.length - 1].date : null
  for (const item of page.story || []) {
    if (item.type !== 'method') continue
    for (const raw of (item.text || '').split('\n')) {
      const m = raw.trim().match(VALUE_LINE); if (!m) continue
      const label = m[2].trim(); const key = LABEL_TO_KEY[label]; if (!key) continue
      out.push({ key, label, value: Q.parse(m[1]), site, slug: page.slug || slugOf(page.title), title: page.title, item: item.id, revision: rev })
    }
  }
  return out
}
export const slugOf = t => (t || '').replace(/\s/g, '-').replace(/[^A-Za-z0-9-]/g, '').toLowerCase()

export const isBenchmarks = page => (page.story || []).some(i => i.type === 'table' && /USD\/h/i.test(i.text || ''))
export const isOverrides = page => /overrides?/i.test(page.title || '')

// role of a page from what it declares; null when it declares nothing we know
export const classify = (page, site) => {
  if (isOverrides(page)) return { role: 'scenario-overrides' }
  const decls = declarationsOf(page, site)
  const roles = [...new Set(decls.map(d => ROLE_OF_KEY[d.key]))]
  if (roles.length === 1) return { role: roles[0] }
  if (roles.length > 1) return { role: null, error: `${page.title} declares keys of ${roles.length} roles (${roles.join(', ')}); a page fills one role, or is titled Overrides` }
  if (isBenchmarks(page)) return { role: 'cloud-benchmarks' }
  return { role: null }
}

// pages: [{page, site, pinned?}] in lineup order. Returns the resolved input bundle.
export const resolve = (pages, manifest = MANIFEST) => {
  const errors = [], warnings = [], byRole = {}, facts = {}, shadowed = []
  for (const { page, site, pinned } of pages) {
    const c = classify(page, site)
    if (c.error) errors.push(c.error)
    if (!c.role) continue
    ;(byRole[c.role] ||= []).push({ title: page.title, site, pinned: !!pinned, page })
  }
  for (const { role, cardinality } of manifest.requires) {
    const n = (byRole[role] || []).length
    if (cardinality === 'one' && n === 0) errors.push(`missing required role ${role}`)
    if ((cardinality === 'one' || cardinality === 'zero-or-one') && n > 1)
      errors.push(`role ${role} filled ${n} times: ${byRole[role].map(p => p.title).join(', ')}`)
  }
  // canonical facts from every non-override page; a duplicate key is an error
  for (const [role, list] of Object.entries(byRole)) {
    if (role === 'scenario-overrides' || role === 'cloud-benchmarks') continue
    for (const p of list) for (const d of declarationsOf(p.page, p.site)) {
      if (facts[d.key]) errors.push(`duplicate ${d.key}: ${facts[d.key].title} and ${d.title}`)
      else facts[d.key] = d
    }
  }
  // overrides shadow, and every shadow is listed
  for (const p of byRole['scenario-overrides'] || []) for (const d of declarationsOf(p.page, p.site)) {
    const was = facts[d.key]
    shadowed.push({ key: d.key, label: d.label, from: was ? was.value : null, to: d.value, fromPage: was ? was.title : null, page: d.title })
    facts[d.key] = { ...d, shadows: was || null }
  }
  return { errors, warnings, roles: byRole, facts, shadowed, benchmarks: byRole['cloud-benchmarks'] || [] }
}

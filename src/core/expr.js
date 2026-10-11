// A small expression language for the formula bundle: numbers, dotted names,
// + - * / ( ) and max(a, b) / min(a, b). Hand-written lexer and recursive-descent
// parser; no eval, no Function. Evaluation is exact (rational.js).
import { Q } from './rational.js'

export const lex = src => {
  const out = []; let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) { const m = src.slice(i).match(/^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\.?/); out.push({ t: 'num', v: m[0] }); i += m[0].length; continue }
    if (/[A-Za-z_]/.test(c)) { const m = src.slice(i).match(/^[A-Za-z_][\w.]*/); out.push({ t: 'id', v: m[0] }); i += m[0].length; continue }
    if ('+-*/(),'.includes(c)) { out.push({ t: c }); i++; continue }
    throw new Error(`unexpected character '${c}' at ${i} in: ${src}`)
  }
  return out
}

// AST: {k:'num',v} {k:'ref',name} {k:'bin',op,l,r} {k:'neg',e} {k:'call',fn,args}
export const parse = src => {
  const toks = lex(src); let p = 0
  const peek = () => toks[p], next = () => toks[p++]
  const expect = t => { const x = next(); if (!x || x.t !== t) throw new Error(`expected '${t}' in: ${src}`); return x }
  const primary = () => {
    const x = next()
    if (!x) throw new Error(`unexpected end of: ${src}`)
    if (x.t === 'num') return { k: 'num', v: x.v }
    if (x.t === 'id') {
      if (peek() && peek().t === '(') {
        next(); const args = []
        if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { next(); args.push(expr()) } }
        expect(')'); return { k: 'call', fn: x.v, args }
      }
      return { k: 'ref', name: x.v }
    }
    if (x.t === '(') { const e = expr(); expect(')'); return e }
    if (x.t === '-') return { k: 'neg', e: primary() }
    throw new Error(`unexpected '${x.t}' in: ${src}`)
  }
  const term = () => { let l = primary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = next().t; l = { k: 'bin', op, l, r: primary() } } return l }
  const expr = () => { let l = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; l = { k: 'bin', op, l, r: term() } } return l }
  const ast = expr()
  if (p !== toks.length) throw new Error(`trailing tokens in: ${src}`)
  return ast
}

export const refs = ast => {
  const out = new Set()
  const walk = n => { if (!n) return; if (n.k === 'ref') out.add(n.name); if (n.k === 'bin') { walk(n.l); walk(n.r) } if (n.k === 'neg') walk(n.e); if (n.k === 'call') n.args.forEach(walk) }
  walk(ast); return out
}

const FUNCS = {
  max: a => a.reduce((m, x) => x.gt(m) ? x : m),
  min: a => a.reduce((m, x) => x.lt(m) ? x : m),
}
export const evaluate = (ast, env) => {
  switch (ast.k) {
    case 'num': return Q.parse(ast.v)
    case 'ref': { if (!(ast.name in env)) throw new Error(`missing input: ${ast.name}`); return Q.from(env[ast.name]) }
    case 'neg': return evaluate(ast.e, env).neg()
    case 'call': { const f = FUNCS[ast.fn]; if (!f) throw new Error(`unknown function: ${ast.fn}`); return f(ast.args.map(a => evaluate(a, env))) }
    case 'bin': { const l = evaluate(ast.l, env), r = evaluate(ast.r, env)
      return ast.op === '+' ? l.add(r) : ast.op === '-' ? l.sub(r) : ast.op === '*' ? l.mul(r) : l.div(r) }
  }
  throw new Error(`bad node ${ast.k}`)
}

// Order formulas by dependency; detect cycles; report which inputs the bundle needs.
export const plan = formulas => {
  const asts = {}; for (const [k, src] of Object.entries(formulas)) asts[k] = parse(src)
  const deps = {}; for (const k of Object.keys(asts)) deps[k] = [...refs(asts[k])].filter(r => r in asts)
  const inputs = new Set(); for (const k of Object.keys(asts)) for (const r of refs(asts[k])) if (!(r in asts)) inputs.add(r)
  const order = [], state = {}
  const visit = (k, stack) => {
    if (state[k] === 2) return
    if (state[k] === 1) throw new Error(`formula cycle: ${[...stack, k].join(' -> ')}`)
    state[k] = 1; for (const d of deps[k]) visit(d, [...stack, k]); state[k] = 2; order.push(k)
  }
  for (const k of Object.keys(asts)) visit(k, [])
  return { asts, order, inputs: [...inputs].sort(), deps }
}

export const run = (planned, env) => {
  const out = { ...env }
  for (const k of planned.order) out[k] = evaluate(planned.asts[k], out)
  return out
}

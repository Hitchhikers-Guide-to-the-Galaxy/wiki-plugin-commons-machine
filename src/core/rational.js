// Exact rational arithmetic on BigInt — money never touches a double until display.
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a }
export class Q {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('division by zero')
    if (d < 0n) { n = -n; d = -d }
    const g = gcd(n, d) || 1n
    this.n = n / g; this.d = d / g
  }
  static from(x) {
    if (x instanceof Q) return x
    if (typeof x === 'bigint') return new Q(x)
    if (typeof x === 'number') { if (!Number.isFinite(x)) throw new Error(`not a number: ${x}`); return Q.parse(String(x)) }
    return Q.parse(String(x))
  }
  static parse(s) {
    const m = String(s).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new Error(`not a number: ${s}`)
    const sign = m[1] === '-' ? -1n : 1n
    const int = m[2] || '0', frac = m[3] || ''
    let n = BigInt(int + frac) * sign, d = 10n ** BigInt(frac.length)
    const e = m[4] ? parseInt(m[4], 10) : 0
    if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e)
    return new Q(n, d)
  }
  add(o) { o = Q.from(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d) }
  sub(o) { o = Q.from(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d) }
  mul(o) { o = Q.from(o); return new Q(this.n * o.n, this.d * o.d) }
  div(o) { o = Q.from(o); return new Q(this.n * o.d, this.d * o.n) }
  neg() { return new Q(-this.n, this.d) }
  cmp(o) { o = Q.from(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0 }
  lt(o) { return this.cmp(o) < 0 } le(o) { return this.cmp(o) <= 0 } gt(o) { return this.cmp(o) > 0 } ge(o) { return this.cmp(o) >= 0 } eq(o) { return this.cmp(o) === 0 }
  isZero() { return this.n === 0n }
  floor() { let q = this.n / this.d; if (this.n < 0n && q * this.d !== this.n) q -= 1n; return q }
  toNumber() { return Number(this.n) / Number(this.d) }
  // decimal string, rounded half away from zero at `places`
  toFixed(places = 2) {
    const neg = this.n < 0n, n = neg ? -this.n : this.n
    const scale = 10n ** BigInt(places)
    let v = (n * scale * 2n + this.d) / (2n * this.d)  // round half up
    const s = v.toString().padStart(places + 1, '0')
    const int = s.slice(0, s.length - places), frac = s.slice(s.length - places)
    return (neg && v !== 0n ? '-' : '') + int + (places ? '.' + frac : '')
  }
  toString() { return this.d === 1n ? this.n.toString() : this.toFixed(10).replace(/\.?0+$/, '') }
}
export const q = x => Q.from(x)

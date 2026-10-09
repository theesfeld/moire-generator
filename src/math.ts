export const TAU = Math.PI * 2
export const DEG = Math.PI / 180

export function mod(a: number, b: number): number {
  return a - b * Math.floor(a / b)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function wrap01(t: number): number {
  t %= 1
  if (t < 0) t += 1
  return t
}

/** Normalized sinc, sin(πx)/(πx). */
export function sinc(x: number): number {
  const ax = Math.abs(x)
  if (ax < 1e-8) return 1
  return Math.sin(Math.PI * x) / (Math.PI * x)
}

export function isNearInteger(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 1e-6
}

export function rot(x: number, y: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: c * x - s * y, y: s * x + c * y }
}

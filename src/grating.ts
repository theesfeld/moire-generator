import { TAU, clamp, sinc } from './math'
import type { Layer, Project } from './types'

/**
 * Band-limited Ronchi ruling.
 *
 * Dark fraction D, centered on the phase origin so the series is a cosine series.
 * Mean transmission is 1 − D.
 * aₙ = −2 D sinc(n D), windowed by the Lanczos σ factor sinc(n / (N+1)).
 * T = clamp(a₀ + Σ aₙ cos(2π n φ), 0, 1).
 *
 * The shader ports this expression directly.
 */
export function ruling(phi: number, duty: number, harmonics: number): number {
  const D = clamp(duty, 0, 1)
  const N = Math.round(clamp(harmonics, 1, 24))
  let sum = 1 - D
  for (let n = 1; n <= N; n++) {
    const sigma = sinc(n / (N + 1))
    const an = -2 * D * sinc(n * D) * sigma
    sum += an * Math.cos(TAU * n * phi)
  }
  return clamp(sum, 0, 1)
}

/** Continuous cosine grating, transmission in [0, 1]. */
export function sinusoid(phi: number): number {
  return 0.5 + 0.5 * Math.cos(TAU * phi)
}

export function profileValue(phi: number, layer: Pick<Layer, 'profile' | 'duty' | 'harmonics'>): number {
  if (layer.profile === 'sinusoid') return sinusoid(phi)
  return ruling(phi, layer.duty, layer.harmonics)
}

export interface LiveLayer {
  angle: number
  phaseCycles: number
  centerX: number
  centerY: number
}

/** Angle, phase (cycles), and center after the loop motion is applied. */
export function liveLayer(layer: Layer, project: Project, time: number): {
  angle: number
  phase: number
  centerX: number
  centerY: number
} {
  const m = project.motion
  const orbit = TAU * layer.orbitCycles * m * time
  return {
    angle: layer.angle + TAU * layer.rotCycles * m * time,
    phase: layer.phase / TAU + layer.phaseCycles * m * time,
    centerX: layer.centerX + layer.orbitR * Math.cos(orbit),
    centerY: layer.centerY + layer.orbitR * Math.sin(orbit),
  }
}

/**
 * Phase in cycles for the scalar gratings (lines, rings, zones, spokes, spirals).
 * `x` and `y` are in pattern space: short side = 1, origin centered, y up.
 * Returns null for lattices, whose transmission is not a 1D phase.
 */
export function scalarPhase(layer: Layer, project: Project, time: number, x: number, y: number): number | null {
  const live = liveLayer(layer, project, time)
  let qx = x - live.centerX
  let qy = y - live.centerY
  const c = Math.cos(-live.angle)
  const s = Math.sin(-live.angle)
  const rx = c * qx - s * qy
  const ry = s * qx + c * qy
  qx = rx
  qy = ry * Math.max(layer.aspect, 0.05)
  if (layer.warp !== 0) {
    qx += layer.warp * Math.sin(TAU * (layer.warpFreq * qy + live.phase))
  }
  const phase = live.phase
  if (layer.type === 'lines') return layer.freq * qx + phase
  if (layer.type === 'rings') return layer.freq * Math.hypot(qx, qy) + phase
  if (layer.type === 'zone') {
    const r = Math.hypot(qx, qy)
    // Z cycles by the time r reaches the short-side edge at 0.5.
    return layer.freq * 4 * r * r + phase
  }
  if (layer.type === 'spokes') {
    const arms = Math.max(1, Math.round(layer.freq))
    return (arms * Math.atan2(qy, qx)) / TAU + phase
  }
  if (layer.type === 'spiral') {
    const arms = Math.max(1, Math.round(layer.freqB))
    return (arms * Math.atan2(qy, qx)) / TAU + layer.freq * Math.hypot(qx, qy) + phase
  }
  if (layer.type === 'logSpiral') {
    const arms = Math.max(1, Math.round(layer.freqB))
    const r = Math.max(Math.hypot(qx, qy), 1e-4)
    return (arms * Math.atan2(qy, qx)) / TAU + layer.freq * Math.log(r) + phase
  }
  return null
}

/** Two zone plates of equal strength produce a linear beat of this frequency. */
export function zoneBeat(zones: number, dx: number, dy: number): number {
  return 8 * zones * Math.hypot(dx, dy)
}

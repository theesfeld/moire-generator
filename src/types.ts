export const MAX_LAYERS = 12

export const LAYER_TYPES = [
  'lines',
  'spokes',
  'rings',
  'zone',
  'spiral',
  'logSpiral',
  'dots',
  'hex',
  'grid',
  'checker',
] as const

export type LayerType = (typeof LAYER_TYPES)[number]

export const BLEND_MODES = [
  'transmission',
  'cross',
  'difference',
  'add',
  'screen',
  'min',
  'max',
] as const

export type BlendMode = (typeof BLEND_MODES)[number]

export const PROFILES = ['sinusoid', 'ruling'] as const
export type Profile = (typeof PROFILES)[number]

/** One physical grating, lattice, or zone plate. Angles are radians. */
export interface Layer {
  id: string
  name: string
  type: LayerType
  enabled: boolean
  /** 0 = absent, 1 = fully in the stack. */
  opacity: number
  /**
   * Cycles per unit, spoke count, zones from center to the short-side edge,
   * or lattice cells per unit. The short side of the frame is one unit.
   */
  freq: number
  /** Spiral arm count, or the grid's vertical / horizontal frequency. */
  freqB: number
  /** Frequency-vector angle. 0 means phase varies along +x (vertical lines). */
  angle: number
  /** Static phase, radians. */
  phase: number
  /** Phase revolutions over one loop. Integers close the loop. */
  phaseCycles: number
  /** Whole-pattern revolutions over one loop. */
  rotCycles: number
  profile: Profile
  /** Harmonics kept in a Ronchi / square ruling. 1 is the fundamental. */
  harmonics: number
  /** Dark fraction of a ruling, or dot radius as a fraction of the cell half-pitch. */
  duty: number
  centerX: number
  centerY: number
  /** Radius of a circular orbit of the center, in units. */
  orbitR: number
  orbitCycles: number
  /** Local Y scale before the pattern is evaluated. 1 is isotropic. */
  aspect: number
  /** Peak lateral displacement of the grating, in units. */
  warp: number
  warpFreq: number
  /** Transmission color of the open part of the filter. */
  color: [number, number, number]
  /** 0 = neutral density, 1 = the open film is a gel of `color`. */
  colorize: number
}

export interface Project {
  version: 1
  layers: Layer[]
  blend: BlendMode
  exposure: number
  gamma: number
  contrast: number
  saturation: number
  invert: boolean
  /** 0 disables. Otherwise luminance is split around this level. */
  threshold: number
  vignette: number
  /** 0 disables. Otherwise a hard circular matte in screen radii. */
  iris: number
  /** Fractional scale difference between the red and blue evaluations. */
  chroma: number
  /** 0 disables. 2 or more folds the field into that many mirrored sectors. */
  kaleido: number
  /** 0 disables. 2 or more tiles the field that many times across the unit. */
  tile: number
  globalScale: number
  pulseAmp: number
  pulseCycles: number
  globalRot: number
  globalRotCycles: number
  /** Multiplies every per-loop cycle count. */
  motion: number
  loopSeconds: number
  /** Preview rate. Does not change the loop; 1 plays one loop per `loopSeconds`. */
  playback: number
  /** N×N samples averaged per pixel. This is the pixel's integral of the product. */
  samples: number
}

export const TYPE_INDEX: Record<LayerType, number> = {
  lines: 0,
  spokes: 1,
  rings: 2,
  zone: 3,
  spiral: 4,
  logSpiral: 5,
  dots: 6,
  hex: 7,
  grid: 8,
  checker: 9,
}

export const BLEND_INDEX: Record<BlendMode, number> = {
  transmission: 0,
  cross: 1,
  difference: 2,
  add: 3,
  screen: 4,
  min: 5,
  max: 6,
}

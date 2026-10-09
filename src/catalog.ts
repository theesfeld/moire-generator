import type { BlendMode, Layer, LayerType } from './types'

export const TYPE_LABEL: Record<LayerType, string> = {
  lines: 'Lines',
  spokes: 'Spokes',
  rings: 'Rings',
  zone: 'Zone plate',
  spiral: 'Spiral',
  logSpiral: 'Log spiral',
  dots: 'Dots',
  hex: 'Hex dots',
  grid: 'Grid',
  checker: 'Checker',
}

export const BLEND_LABEL: Record<BlendMode, string> = {
  transmission: 'Transmission',
  cross: 'Cross term',
  difference: 'Difference',
  add: 'Add',
  screen: 'Screen',
  min: 'Min',
  max: 'Max',
}

export const BLEND_NOTE: Record<BlendMode, string> = {
  transmission: 'Physical stack. Each layer is a filter and the frame is the product of the transmissions.',
  cross: 'Interference term only: ½ + ½ ∏ (2T − 1). The sum frequencies are removed.',
  difference: 'Absolute difference of successive patterns.',
  add: 'Opacity-weighted mean of the patterns.',
  screen: '1 − ∏ (1 − T). Light through a stack of emitters rather than filters.',
  min: 'Darkest transmission at each pixel.',
  max: 'Brightest pattern at each pixel.',
}

export type ControlId =
  | 'freq'
  | 'freqB'
  | 'angle'
  | 'phase'
  | 'phaseCycles'
  | 'rotCycles'
  | 'profile'
  | 'harmonics'
  | 'duty'
  | 'center'
  | 'orbit'
  | 'aspect'
  | 'warp'
  | 'color'

const SCALAR = new Set<ControlId>([
  'freq',
  'angle',
  'phase',
  'phaseCycles',
  'rotCycles',
  'profile',
  'harmonics',
  'duty',
  'center',
  'orbit',
  'aspect',
  'warp',
  'color',
])

export function controlsFor(layer: Layer): Set<ControlId> {
  const controls = new Set<ControlId>()
  if (layer.type === 'grid') {
    for (const id of ['freq', 'freqB', 'angle', 'phase', 'phaseCycles', 'rotCycles', 'profile', 'harmonics', 'duty', 'center', 'orbit', 'aspect', 'warp', 'color'] as const) {
      controls.add(id)
    }
  } else if (layer.type === 'spiral' || layer.type === 'logSpiral') {
    for (const id of SCALAR) controls.add(id)
    controls.add('freqB')
  } else if (layer.type === 'dots' || layer.type === 'hex') {
    for (const id of ['freq', 'angle', 'phase', 'phaseCycles', 'rotCycles', 'profile', 'duty', 'center', 'orbit', 'aspect', 'color'] as const) {
      controls.add(id)
    }
  } else if (layer.type === 'checker') {
    for (const id of ['freq', 'angle', 'phase', 'phaseCycles', 'rotCycles', 'profile', 'harmonics', 'center', 'orbit', 'aspect', 'color'] as const) {
      controls.add(id)
    }
  } else {
    for (const id of SCALAR) controls.add(id)
  }
  if (layer.profile === 'sinusoid' && layer.type !== 'dots' && layer.type !== 'hex') {
    controls.delete('harmonics')
    controls.delete('duty')
  }
  return controls
}

export function freqLabel(layer: Layer): string {
  switch (layer.type) {
    case 'spokes':
      return 'Count'
    case 'zone':
      return 'Zones to edge'
    case 'logSpiral':
      return 'Pitch'
    case 'dots':
    case 'hex':
      return 'Cells / unit'
    case 'spiral':
      return 'Radial cycles'
    default:
      return 'Cycles / unit'
  }
}

export function freqBLabel(layer: Layer): string {
  if (layer.type === 'grid') return 'Y / X frequency'
  return 'Arms'
}

export function dutyLabel(layer: Layer): string {
  if (layer.type === 'dots' || layer.type === 'hex') return 'Radius'
  return 'Dark fraction'
}

export function profileLabel(layer: Layer): string {
  if (layer.type === 'dots' || layer.type === 'hex') return 'Dot'
  return 'Profile'
}

export function formulaFor(layer: Layer): string {
  const ruling = 'A ruling is the Fourier series of dark fraction d, N harmonics, Lanczos-windowed. A sinusoid is ½ + ½ cos(2πφ).'
  switch (layer.type) {
    case 'lines':
      return `φ = f (x cos α + y sin α) + φ₀. ${ruling}`
    case 'spokes':
      return `φ = n θ / 2π + φ₀, with n rounded to an integer so the field has no seam. ${ruling}`
    case 'rings':
      return `φ = f r + φ₀. ${ruling}`
    case 'zone':
      return 'φ = Z (r / ½)² + φ₀. Equal plates displaced by Δc beat at 8 Z |Δc| cycles per unit.'
    case 'spiral':
      return `φ = n θ / 2π + f r + φ₀. ${ruling}`
    case 'logSpiral':
      return `φ = n θ / 2π + f ln r + φ₀. ${ruling}`
    case 'dots':
      return 'Circular dots on a square lattice. Frequency is cells per unit. Radius is a fraction of the half-pitch.'
    case 'hex':
      return 'Circular dots on a hexagonal lattice. Frequency is cells per unit.'
    case 'grid':
      return 'Two rulings on one screen, horizontal and vertical in the layer frame. Transmission is their product.'
    case 'checker':
      return 'XOR of two square gratings: T = A + B − 2AB. Adjacent cells have opposite transmission.'
  }
}

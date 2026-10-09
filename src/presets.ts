import { baseProject, createLayer } from './model'
import { DEG } from './math'
import type { Layer, Project } from './types'

function lines(partial: Partial<Layer>): Layer {
  return createLayer('lines', {
    profile: 'ruling',
    harmonics: 15,
    duty: 0.22,
    freq: 36,
    ...partial,
  })
}

export interface Preset {
  id: string
  name: string
  build: () => Project
}

export const PRESETS: Preset[] = [
  {
    id: 'angle',
    name: 'Angle',
    build: () => {
      const a = lines({ name: 'Lines 1', freq: 40, angle: 0, phaseCycles: 0 })
      const b = lines({ name: 'Lines 2', freq: 40, angle: 3.2 * DEG, phaseCycles: 1 })
      return baseProject([a, b])
    },
  },
  {
    id: 'pitch',
    name: 'Pitch',
    build: () => {
      const a = lines({ name: 'Lines 1', freq: 36, angle: 0 })
      const b = lines({ name: 'Lines 2', freq: 40, angle: 0, phaseCycles: 1 })
      return baseProject([a, b])
    },
  },
  {
    id: 'bend',
    name: 'Bend',
    build: () => {
      const a = lines({ name: 'Straight', freq: 34, angle: -1.4 * DEG })
      const b = lines({
        name: 'Bent',
        freq: 34,
        angle: 1.4 * DEG,
        warp: 0.028,
        warpFreq: 2.5,
        phaseCycles: 1,
      })
      return baseProject([a, b])
    },
  },
  {
    id: 'spokes',
    name: 'Spokes',
    build: () => {
      const a = createLayer('spokes', {
        name: 'Spokes 1',
        freq: 42,
        duty: 0.28,
        harmonics: 11,
        profile: 'ruling',
        rotCycles: 0,
      })
      const b = createLayer('spokes', {
        name: 'Spokes 2',
        freq: 48,
        duty: 0.28,
        harmonics: 11,
        profile: 'ruling',
        centerX: 0.012,
        rotCycles: 1,
      })
      return baseProject([a, b])
    },
  },
  {
    id: 'zones',
    name: 'Zones',
    build: () => {
      const a = createLayer('zone', {
        name: 'Zone 1',
        freq: 24,
        profile: 'sinusoid',
        centerX: -0.01,
        phaseCycles: 1,
      })
      const b = createLayer('zone', {
        name: 'Zone 2',
        freq: 24,
        profile: 'sinusoid',
        centerX: 0.01,
        phaseCycles: 0,
      })
      const project = baseProject([a, b])
      project.exposure = 1.35
      return project
    },
  },
  {
    id: 'spirals',
    name: 'Spirals',
    build: () => {
      const a = createLayer('spiral', {
        name: 'Spiral 1',
        freq: 14,
        freqB: 7,
        profile: 'sinusoid',
        rotCycles: 1,
      })
      const b = createLayer('spiral', {
        name: 'Spiral 2',
        freq: 15,
        freqB: 7,
        profile: 'sinusoid',
        rotCycles: -1,
        phaseCycles: 1,
      })
      return baseProject([a, b])
    },
  },
  {
    id: 'rings',
    name: 'Rings',
    build: () => {
      const a = createLayer('rings', {
        name: 'Rings 1',
        freq: 40,
        duty: 0.3,
        harmonics: 13,
        profile: 'ruling',
      })
      const b = createLayer('rings', {
        name: 'Rings 2',
        freq: 46,
        duty: 0.3,
        harmonics: 13,
        profile: 'ruling',
        centerX: 0.02,
        phaseCycles: 1,
      })
      return baseProject([a, b])
    },
  },
  {
    id: 'halftone',
    name: 'Halftone',
    build: () => {
      const screens: Array<Partial<Layer> & { name: string; angle: number; color: [number, number, number] }> = [
        { name: 'Cyan', angle: 15 * DEG, color: [0, 0.85, 0.9], freq: 16 },
        { name: 'Magenta', angle: 75 * DEG, color: [0.95, 0.15, 0.55], freq: 16 },
        { name: 'Yellow', angle: 0, color: [0.98, 0.86, 0.15], freq: 16 },
        { name: 'Black', angle: 45 * DEG, color: [1, 1, 1], freq: 17, colorize: 0 },
      ]
      const layers = screens.map((screen, index) =>
        createLayer('dots', {
          name: screen.name,
          angle: screen.angle,
          freq: screen.freq,
          duty: 0.62,
          profile: 'ruling',
          color: screen.color,
          colorize: screen.colorize ?? 1,
          opacity: 0.92,
          phaseCycles: index === 3 ? 1 : 0,
        }),
      )
      const project = baseProject(layers)
      project.exposure = 1.05
      project.contrast = 1.05
      return project
    },
  },
  {
    id: 'tricolor',
    name: 'Tricolor',
    build: () => {
      const specs: Array<[string, number, [number, number, number], number]> = [
        ['Red', 0, [1, 0.25, 0.18], 1],
        ['Green', 60 * DEG, [0.35, 1, 0.4], 0],
        ['Blue', 120 * DEG, [0.3, 0.55, 1], -1],
      ]
      const layers = specs.map(([name, angle, color, phaseCycles]) =>
        lines({
          name,
          angle,
          color,
          colorize: 1,
          phaseCycles,
          freq: 22,
          duty: 0.35,
        }),
      )
      const project = baseProject(layers)
      project.exposure = 1.3
      return project
    },
  },
  {
    id: 'projection',
    name: 'Projection',
    build: () => {
      const a = lines({ name: 'Lines 1', freq: 48, angle: -1.5 * DEG, duty: 0.16, harmonics: 17 })
      const b = lines({ name: 'Lines 2', freq: 48, angle: 1.5 * DEG, duty: 0.16, harmonics: 17, phaseCycles: 1 })
      const project = baseProject([a, b])
      project.loopSeconds = 8
      project.vignette = 0.45
      project.exposure = 1.25
      project.contrast = 1.2
      project.gamma = 0.88
      return project
    },
  },
]

export function presetById(id: string): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}

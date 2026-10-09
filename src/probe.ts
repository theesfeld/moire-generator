import type { Engine } from './engine'
import { profileValue, scalarPhase } from './grating'
import { baseProject, createLayer } from './model'
import type { Layer, Project } from './types'

function identity(layers: Layer[]): Project {
  const project = baseProject(layers)
  project.exposure = 1
  project.gamma = 1
  project.contrast = 1
  project.saturation = 1
  project.invert = false
  project.threshold = 0
  project.vignette = 0
  project.iris = 0
  project.chroma = 0
  project.kaleido = 0
  project.tile = 0
  project.globalScale = 1
  project.globalRot = 0
  project.pulseAmp = 0
  project.motion = 1
  project.samples = 1
  return project
}

function maxError(engine: Engine, project: Project, width: number, height: number): number {
  const pixels = engine.readRaw(project, 0, width, height)
  const short = Math.min(width, height)
  let worst = 0
  for (let j = 16; j < height; j += 28) {
    for (let i = 16; i < width; i += 28) {
      const x = (i + 0.5 - width / 2) / short
      const y = (j + 0.5 - height / 2) / short
      let expected = 1
      for (const layer of project.layers) {
        const phi = scalarPhase(layer, project, 0, x, y)
        if (phi === null) throw new Error(`No scalar phase for ${layer.type}`)
        expected *= profileValue(phi, layer)
      }
      const p = (j * width + i) * 4
      const got = pixels[p] / 255
      worst = Math.max(worst, Math.abs(got - expected))
    }
  }
  return worst
}

/** Compare the GPU field with the TypeScript series at pixel centers. */
export function probeShader(engine: Engine): string[] {
  const errors: string[] = []
  const width = 180
  const height = 140
  const cases: Array<[string, Project]> = [
    [
      'sinusoid',
      identity([
        createLayer('lines', {
          profile: 'sinusoid',
          freq: 8,
          angle: 0.4,
          phase: 0.7,
          duty: 0.5,
          aspect: 1.3,
          warp: 0.02,
          warpFreq: 2,
          centerX: 0.05,
          centerY: -0.04,
        }),
      ]),
    ],
    [
      'ruling',
      identity([
        createLayer('lines', {
          profile: 'ruling',
          freq: 5,
          angle: -0.35,
          phase: 0.2,
          duty: 0.35,
          harmonics: 7,
          aspect: 0.8,
        }),
      ]),
    ],
    [
      'zone',
      identity([
        createLayer('zone', {
          profile: 'sinusoid',
          freq: 10,
          centerX: 0.08,
          centerY: -0.05,
          aspect: 1,
        }),
      ]),
    ],
    [
      'spokes',
      identity([
        createLayer('spokes', {
          profile: 'sinusoid',
          freq: 11,
          phase: 0.4,
          centerX: -0.02,
          centerY: 0.03,
        }),
      ]),
    ],
    [
      'product',
      identity([
        createLayer('lines', { profile: 'sinusoid', freq: 7, angle: 0.2, name: 'A' }),
        createLayer('lines', { profile: 'sinusoid', freq: 9, angle: -0.15, phase: 0.5, name: 'B' }),
      ]),
    ],
  ]

  for (const [name, project] of cases) {
    const worst = maxError(engine, project, width, height)
    if (worst > 3 / 255) errors.push(`${name} max error ${worst.toFixed(4)}`)
    else errors.push(`${name} ok ${worst.toFixed(4)}`)
  }
  return errors
}

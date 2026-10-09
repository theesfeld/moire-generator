import { ruling, sinusoid, zoneBeat } from './grating'
import { TAU, rot } from './math'
import { baseProject, createLayer, loopIsExact, snapProjectToLoop } from './model'
import { bufferToRaw, frameOf, patternToBuffer, rawToPattern } from './transform'

function close(actual: number, expected: number, eps: number, label: string, errors: string[]): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > eps) {
    errors.push(`${label}: ${actual} vs ${expected}`)
  }
}

/** Pure-function checks for the grating series, the beat formula, and the field transform. */
export function selfTest(): string[] {
  const errors: string[] = []

  close(ruling(0.2, 0, 8), 1, 1e-9, 'clear ruling', errors)
  close(ruling(0.2, 1, 8), 0, 1e-9, 'opaque ruling', errors)
  close(ruling(0, 0.5, 48), 0, 0.03, 'ruling dark center', errors)
  close(ruling(0.5, 0.5, 48), 1, 0.03, 'ruling bright center', errors)

  let mean = 0
  const samples = 64
  for (let i = 0; i < samples; i++) mean += ruling((i + 0.5) / samples, 0.3, 12)
  close(mean / samples, 0.7, 0.02, 'ruling mean', errors)

  const phase = 0.37
  close(sinusoid(phase), 0.5 + 0.5 * Math.cos(TAU * phase), 1e-12, 'sinusoid', errors)

  const angleA = 1.3
  const angleB = -0.7
  const left = (0.5 + 0.5 * Math.cos(angleA)) * (0.5 + 0.5 * Math.cos(angleB))
  const right =
    0.25 +
    0.25 * Math.cos(angleA) +
    0.25 * Math.cos(angleB) +
    0.125 * (Math.cos(angleA + angleB) + Math.cos(angleA - angleB))
  close(left, right, 1e-12, 'product identity', errors)
  close(zoneBeat(24, 0.02, 0), 3.84, 1e-12, 'zone beat', errors)

  const project = baseProject([createLayer('lines')])
  project.globalScale = 1.7
  project.globalRot = 0.4
  project.pulseAmp = 0.25
  project.pulseCycles = 1
  const time = 0.3
  const frame = frameOf(project, time)
  const raw = { x: 0.21, y: -0.13 }
  const pattern = rawToPattern(raw.x, raw.y, project, time)
  const back = rot(pattern.x * frame.scale, pattern.y * frame.scale, -frame.angle)
  close(back.x, raw.x, 1e-9, 'round trip x', errors)
  close(back.y, raw.y, 1e-9, 'round trip y', errors)

  project.globalScale = 1
  project.globalRot = 0
  project.pulseAmp = 0
  project.tile = 3
  project.kaleido = 0
  const center = { x: 0.2, y: -0.15 }
  const copies = patternToBuffer(center.x, center.y, project, 0, 400, 300)
  if (copies.length < 2) errors.push('tile copies')
  for (const copy of copies) {
    const again = bufferToRaw(copy.x, copy.y, 400, 300)
    const folded = rawToPattern(again.x, again.y, project, 0)
    close(folded.x, center.x, 1e-6, 'tile x', errors)
    close(folded.y, center.y, 1e-6, 'tile y', errors)
  }

  project.tile = 0
  project.kaleido = 6
  const radius = 0.25
  const fixed = 15 * (Math.PI / 180)
  const stayed = rawToPattern(radius * Math.cos(fixed), radius * Math.sin(fixed), project, 0)
  close(Math.atan2(stayed.y, stayed.x), fixed, 1e-6, 'kaleido fixed point', errors)
  const folded = 10 * (Math.PI / 180)
  const source = 40 * (Math.PI / 180)
  const foldedPoint = rawToPattern(radius * Math.cos(source), radius * Math.sin(source), project, 0)
  close(Math.atan2(foldedPoint.y, foldedPoint.x), folded, 1e-6, 'kaleido fold', errors)
  const images = patternToBuffer(radius * Math.cos(folded), radius * Math.sin(folded), project, 0, 400, 300)
  if (images.length < 2) errors.push('kaleido copies')
  for (const image of images) {
    const again = bufferToRaw(image.x, image.y, 400, 300)
    const back = rawToPattern(again.x, again.y, project, 0)
    close(back.x, radius * Math.cos(folded), 1e-5, 'kaleido x', errors)
    close(back.y, radius * Math.sin(folded), 1e-5, 'kaleido y', errors)
  }

  project.kaleido = 0
  project.motion = 1
  project.layers[0].phaseCycles = 2
  if (!loopIsExact(project)) errors.push('integer motion should close')
  project.motion = 1.5
  if (loopIsExact(project)) errors.push('fractional motion should stay open')
  snapProjectToLoop(project)
  if (!loopIsExact(project)) errors.push('snap should close the loop')

  return errors
}

import { liveLayer, zoneBeat } from './grating'
import { DEG, TAU, isNearInteger } from './math'
import {
  BLEND_MODES,
  LAYER_TYPES,
  MAX_LAYERS,
  PROFILES,
  type BlendMode,
  type Layer,
  type LayerType,
  type Profile,
  type Project,
} from './types'

let idCounter = 0

export function nextId(): string {
  idCounter += 1
  return `l${Date.now().toString(36)}${idCounter.toString(36)}`
}

export function createLayer(type: LayerType, partial: Partial<Layer> = {}): Layer {
  const layer: Layer = {
    id: nextId(),
    name: 'Layer',
    type,
    enabled: true,
    opacity: 1,
    freq: 32,
    freqB: 1,
    angle: 0,
    phase: 0,
    phaseCycles: 0,
    rotCycles: 0,
    profile: 'ruling',
    harmonics: 15,
    duty: 0.22,
    centerX: 0,
    centerY: 0,
    orbitR: 0,
    orbitCycles: 0,
    aspect: 1,
    warp: 0,
    warpFreq: 3,
    color: [1, 1, 1],
    colorize: 0,
  }
  return Object.assign(layer, partial, { type })
}

export function baseProject(layers: Layer[]): Project {
  return {
    version: 1,
    layers,
    blend: 'transmission',
    exposure: 1.15,
    gamma: 0.92,
    contrast: 1.12,
    saturation: 1,
    invert: false,
    threshold: 0,
    vignette: 0,
    iris: 0,
    chroma: 0,
    kaleido: 0,
    tile: 0,
    globalScale: 1,
    pulseAmp: 0,
    pulseCycles: 1,
    globalRot: 0,
    globalRotCycles: 0,
    motion: 1,
    loopSeconds: 6,
    playback: 1,
    samples: 2,
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function rgb(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return [1, 1, 1]
  return [num(value[0], 1), num(value[1], 1), num(value[2], 1)]
}

function asType(value: unknown): LayerType {
  return LAYER_TYPES.includes(value as LayerType) ? (value as LayerType) : 'lines'
}

function asBlend(value: unknown): BlendMode {
  return BLEND_MODES.includes(value as BlendMode) ? (value as BlendMode) : 'transmission'
}

function asProfile(value: unknown): Profile {
  return PROFILES.includes(value as Profile) ? (value as Profile) : 'ruling'
}

export function sanitizeLayer(value: unknown): Layer | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Layer>
  const type = asType(raw.type)
  const layer = createLayer(type)
  layer.id = typeof raw.id === 'string' && raw.id ? raw.id : nextId()
  layer.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 48) : layer.name
  layer.enabled = bool(raw.enabled, true)
  layer.opacity = num(raw.opacity, 1)
  layer.freq = num(raw.freq, layer.freq)
  layer.freqB = num(raw.freqB, layer.freqB)
  layer.angle = num(raw.angle, 0)
  layer.phase = num(raw.phase, 0)
  layer.phaseCycles = num(raw.phaseCycles, 0)
  layer.rotCycles = num(raw.rotCycles, 0)
  layer.profile = asProfile(raw.profile)
  layer.harmonics = Math.round(num(raw.harmonics, 15))
  layer.duty = num(raw.duty, layer.duty)
  layer.centerX = num(raw.centerX, 0)
  layer.centerY = num(raw.centerY, 0)
  layer.orbitR = num(raw.orbitR, 0)
  layer.orbitCycles = num(raw.orbitCycles, 0)
  layer.aspect = num(raw.aspect, 1)
  layer.warp = num(raw.warp, 0)
  layer.warpFreq = num(raw.warpFreq, 3)
  layer.color = rgb(raw.color)
  layer.colorize = num(raw.colorize, 0)
  return layer
}

export function sanitizeProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Project>
  const layers = Array.isArray(raw.layers)
    ? raw.layers.map(sanitizeLayer).filter((layer): layer is Layer => layer !== null).slice(0, MAX_LAYERS)
    : []
  if (layers.length === 0) return null
  const project = baseProject(layers)
  project.blend = asBlend(raw.blend)
  project.exposure = num(raw.exposure, project.exposure)
  project.gamma = num(raw.gamma, project.gamma)
  project.contrast = num(raw.contrast, project.contrast)
  project.saturation = num(raw.saturation, project.saturation)
  project.invert = bool(raw.invert, false)
  project.threshold = num(raw.threshold, 0)
  project.vignette = num(raw.vignette, 0)
  project.iris = num(raw.iris, 0)
  project.chroma = num(raw.chroma, 0)
  project.kaleido = num(raw.kaleido, 0)
  project.tile = num(raw.tile, 0)
  project.globalScale = num(raw.globalScale, 1)
  project.pulseAmp = num(raw.pulseAmp, 0)
  project.pulseCycles = num(raw.pulseCycles, 1)
  project.globalRot = num(raw.globalRot, 0)
  project.globalRotCycles = num(raw.globalRotCycles, 0)
  project.motion = num(raw.motion, 1)
  project.loopSeconds = Math.max(0.25, num(raw.loopSeconds, 6))
  project.playback = num(raw.playback, 1)
  project.samples = Math.round(num(raw.samples, 2))
  return project
}

/** Motion closes if every animated cycle count, times motion, is an integer. */
export function loopIsExact(project: Project): boolean {
  const motion = project.motion
  const cycles = [project.pulseCycles, project.globalRotCycles]
  for (const layer of project.layers) {
    if (!layer.enabled) continue
    cycles.push(layer.phaseCycles, layer.rotCycles, layer.orbitCycles)
  }
  return cycles.every((cycle) => isNearInteger(cycle * motion))
}

export function snapProjectToLoop(project: Project): void {
  const motion = Math.abs(project.motion) < 1e-8 ? 1 : project.motion
  const snap = (cycle: number) => Math.round(cycle * motion) / motion
  project.pulseCycles = snap(project.pulseCycles)
  project.globalRotCycles = snap(project.globalRotCycles)
  for (const layer of project.layers) {
    layer.phaseCycles = snap(layer.phaseCycles)
    layer.rotCycles = snap(layer.rotCycles)
    layer.orbitCycles = snap(layer.orbitCycles)
  }
}

export interface BeatRow {
  title: string
  detail: string
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(1)
  if (abs >= 10) return n.toFixed(2)
  return n.toFixed(3)
}

function angleDeg(rad: number): string {
  let deg = (rad * 180) / Math.PI
  deg = ((deg + 180) % 360 + 360) % 360 - 180
  return `${fmt(deg)}°`
}

/** Predict the visible beats from the closed-form frequency vectors. */
export function beatRows(project: Project, time: number): BeatRow[] {
  const rows: BeatRow[] = []
  const enabled = project.layers.filter((layer) => layer.enabled)
  const lines = enabled.filter((layer) => layer.type === 'lines')
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = liveLayer(lines[i], project, time)
      const b = liveLayer(lines[j], project, time)
      const kax = lines[i].freq * Math.cos(a.angle)
      const kay = lines[i].freq * Math.sin(a.angle)
      const kbx = lines[j].freq * Math.cos(b.angle)
      const kby = lines[j].freq * Math.sin(b.angle)
      const dx = kax - kbx
      const dy = kay - kby
      const beat = Math.hypot(dx, dy)
      const carrier = Math.hypot(kax + kbx, kay + kby)
      rows.push({
        title: `${lines[i].name} × ${lines[j].name}`,
        detail: `beat ${fmt(beat)} / unit at ${angleDeg(Math.atan2(dy, dx))}, carrier ${fmt(carrier)}`,
      })
    }
  }

  const spokes = enabled.filter((layer) => layer.type === 'spokes')
  for (let i = 0; i < spokes.length; i++) {
    for (let j = i + 1; j < spokes.length; j++) {
      const n1 = Math.round(spokes[i].freq)
      const n2 = Math.round(spokes[j].freq)
      rows.push({
        title: `${spokes[i].name} × ${spokes[j].name}`,
        detail: `|n₁ − n₂| = ${Math.abs(n1 - n2)} angular cycles per turn`,
      })
    }
  }

  const zones = enabled.filter((layer) => layer.type === 'zone')
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = liveLayer(zones[i], project, time)
      const b = liveLayer(zones[j], project, time)
      if (Math.abs(zones[i].freq - zones[j].freq) > 1e-3) {
        rows.push({
          title: `${zones[i].name} × ${zones[j].name}`,
          detail: 'unequal zone strengths, so the beat is not a straight grating',
        })
        continue
      }
      const dx = b.centerX - a.centerX
      const dy = b.centerY - a.centerY
      const freq = zoneBeat(zones[i].freq, dx, dy)
      rows.push({
        title: `${zones[i].name} × ${zones[j].name}`,
        detail: `linear beat ${fmt(freq)} / unit at ${angleDeg(Math.atan2(dy, dx))}`,
      })
    }
  }

  const rings = enabled.filter((layer) => layer.type === 'rings')
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const beat = Math.abs(rings[i].freq - rings[j].freq)
      rows.push({
        title: `${rings[i].name} × ${rings[j].name}`,
        detail: `radial beat ${fmt(beat)} cycles / unit`,
      })
    }
  }

  rows.sort((a, b) => a.title.localeCompare(b.title))
  return rows.slice(0, 6)
}

export function hz(cyclesPerLoop: number, project: Project): number {
  return (cyclesPerLoop * project.motion) / project.loopSeconds
}

export { DEG, TAU }

import {
  BLEND_LABEL,
  BLEND_NOTE,
  TYPE_LABEL,
  controlsFor,
  dutyLabel,
  formulaFor,
  freqBLabel,
  freqLabel,
  profileLabel,
  type ControlId,
} from './catalog'
import { liveLayer } from './grating'
import { DEG } from './math'
import { beatRows, hz, loopIsExact, nextId } from './model'
import { PRESETS } from './presets'
import { LAYER_TYPES, MAX_LAYERS, type Layer, type LayerType, type Project } from './types'

export interface Bridge {
  project: () => Project
  selectedId: () => string | null
  setSelected: (id: string) => void
  playing: () => boolean
  setPlaying: (playing: boolean) => void
  setTime: (time: number) => void
  begin: () => void
  touch: () => void
  end: () => void
  structural: (edit: () => void) => void
  preset: (id: string) => void
  png: () => void
  gif: () => void
  webm: () => void
  mp4: () => void
  saveJson: () => void
  loadJsonText: (text: string) => void
  snap: () => void
  projection: () => void
}

export interface View {
  rebuildList: () => void
  rebuildInspector: () => void
  syncGlobals: () => void
  updateLive: (time: number) => void
  setPlaying: (playing: boolean) => void
  setPreset: (id: string) => void
  setStatus: (text: string) => void
  setBusy: (busy: boolean) => void
  exportSettings: () => { width: number; height: number; frames: number; fps: number }
  setCenter: (x: number, y: number) => void
  syncLayerSliders: () => void
  select: (id: string) => void
}

const EXPORT_KEY = 'moire.export.v1'

function selectedLayer(bridge: Bridge): Layer | null {
  const id = bridge.selectedId()
  return bridge.project().layers.find((layer) => layer.id === id) ?? null
}

function hex(color: [number, number, number]): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`
}

function rgb(value: string): [number, number, number] {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function createView(bridge: Bridge): View {
  const list = document.querySelector('#layer-list') as HTMLElement
  const inspector = document.querySelector('#inspector') as HTMLElement
  const preset = document.querySelector('#preset') as HTMLSelectElement
  const play = document.querySelector('#play') as HTMLButtonElement
  const scrub = document.querySelector('#scrub') as HTMLInputElement
  const phaseRead = document.querySelector('#phase-read') as HTMLOutputElement
  const loopSeconds = document.querySelector('#loop-seconds') as HTMLInputElement
  const playback = document.querySelector('#playback') as HTMLInputElement
  const motion = document.querySelector('#motion') as HTMLInputElement
  const loopFlag = document.querySelector('#loop-flag') as HTMLElement
  const status = document.querySelector('#export-status') as HTMLElement
  const exportW = document.querySelector('#export-w') as HTMLInputElement
  const exportH = document.querySelector('#export-h') as HTMLInputElement
  const exportFrames = document.querySelector('#export-frames') as HTMLInputElement
  const exportFps = document.querySelector('#export-fps') as HTMLInputElement
  const png = document.querySelector('#png') as HTMLButtonElement
  const gif = document.querySelector('#gif') as HTMLButtonElement
  const webm = document.querySelector('#webm') as HTMLButtonElement
  const mp4 = document.querySelector('#mp4') as HTMLButtonElement
  const addButton = document.querySelector('#add-layer') as HTMLButtonElement
  const addMenu = document.querySelector('#add-menu') as HTMLElement
  const file = document.querySelector('#json-file') as HTMLInputElement

  const metas = new Map<string, HTMLElement>()
  const names = new Map<string, HTMLElement>()
  const refreshers = new Map<string, () => void>()
  let scrubbing = false
  let beatKey = ''

  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'Current'
  preset.append(blank)
  for (const item of PRESETS) {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = item.name
    preset.append(option)
  }
  preset.addEventListener('change', () => {
    if (preset.value) bridge.preset(preset.value)
  })

  for (const type of LAYER_TYPES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = TYPE_LABEL[type]
    button.addEventListener('click', () => {
      addMenu.hidden = true
      addLayer(type)
    })
    addMenu.append(button)
  }
  addButton.addEventListener('click', () => {
    addMenu.hidden = !addMenu.hidden
  })
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || addButton.contains(event.target) || addMenu.contains(event.target)) return
    addMenu.hidden = true
  })

  function bindGesture(input: HTMLElement): void {
    input.addEventListener('pointerdown', () => bridge.begin())
    input.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && !event.repeat) bridge.begin()
    })
    input.addEventListener('change', () => bridge.end())
    input.addEventListener('keyup', () => bridge.end())
    input.addEventListener('blur', () => bridge.end())
  }

  function addRange(
    parent: HTMLElement,
    opts: {
      key?: string
      control?: ControlId
      label: string
      min: number
      max: number
      step: number
      get: () => number
      set: (value: number) => void
    },
  ): void {
    const row = document.createElement('label')
    row.className = 'field'
    if (opts.control) row.dataset.control = opts.control
    const name = document.createElement('span')
    name.className = 'label'
    name.textContent = opts.label
    const range = document.createElement('input')
    range.type = 'range'
    const number = document.createElement('input')
    number.type = 'number'
    for (const input of [range, number]) {
      input.min = String(opts.min)
      input.max = String(opts.max)
      input.step = String(opts.step)
      bindGesture(input)
      input.addEventListener('input', () => {
        const value = Number(input.value)
        if (!Number.isFinite(value)) return
        const next = Math.min(opts.max, Math.max(opts.min, value))
        opts.set(next)
        range.value = String(next)
        number.value = String(next)
        bridge.touch()
      })
    }
    const refresh = () => {
      const value = opts.get()
      range.value = String(value)
      number.value = String(Math.round(value * 10000) / 10000)
    }
    refresh()
    row.append(name, range, number)
    parent.append(row)
    if (opts.key) refreshers.set(opts.key, refresh)
  }

  function addNumber(
    parent: HTMLElement,
    opts: {
      control?: ControlId
      label: string
      hz?: 'phase' | 'rot' | 'orbit'
      min: number
      max: number
      step: number
      get: () => number
      set: (value: number) => void
    },
  ): void {
    const row = document.createElement('label')
    row.className = 'field number-only'
    if (opts.control) row.dataset.control = opts.control
    const name = document.createElement('span')
    name.className = 'label'
    name.textContent = opts.label
    if (opts.hz) {
      const rate = document.createElement('em')
      rate.className = 'hz'
      rate.dataset.hz = opts.hz
      name.append(rate)
    }
    const number = document.createElement('input')
    number.type = 'number'
    number.min = String(opts.min)
    number.max = String(opts.max)
    number.step = String(opts.step)
    number.value = String(opts.get())
    bindGesture(number)
    number.addEventListener('input', () => {
      const value = Number(number.value)
      if (!Number.isFinite(value)) return
      opts.set(value)
      bridge.touch()
    })
    row.append(name, number)
    parent.append(row)
  }

  function addCheck(parent: HTMLElement, label: string, get: () => boolean, set: (value: boolean) => void): void {
    const row = document.createElement('label')
    row.className = 'check'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = get()
    input.addEventListener('change', () => {
      bridge.begin()
      set(input.checked)
      bridge.touch()
      bridge.end()
      markEnabled()
    })
    row.append(input, document.createTextNode(label))
    parent.append(row)
  }

  function layerById(id: string): Layer | undefined {
    return bridge.project().layers.find((layer) => layer.id === id)
  }

  function markEnabled(): void {
    for (const row of list.querySelectorAll<HTMLElement>('.layer-row')) {
      const layer = row.dataset.id ? layerById(row.dataset.id) : undefined
      row.classList.toggle('is-off', layer ? !layer.enabled : false)
      const eye = row.querySelector<HTMLButtonElement>('.eye')
      if (eye && layer) eye.textContent = layer.enabled ? '●' : '○'
    }
  }

  function markSelected(): void {
    const id = bridge.selectedId()
    for (const row of list.querySelectorAll<HTMLElement>('.layer-row')) {
      row.setAttribute('aria-current', row.dataset.id === id ? 'true' : 'false')
    }
  }

  function select(id: string): void {
    const changed = bridge.selectedId() !== id
    bridge.setSelected(id)
    markSelected()
    if (changed) rebuildInspector()
  }

  function addLayer(type: LayerType): void {
    const project = bridge.project()
    if (project.layers.length >= MAX_LAYERS) return
    bridge.structural(() => {
      const current = selectedLayer(bridge)
      const layer = {
        id: nextId(),
        name: `${TYPE_LABEL[type]} ${project.layers.filter((item) => item.type === type).length + 1}`,
        type,
        enabled: true,
        opacity: 1,
        freq: current?.freq ?? (type === 'spokes' ? 40 : type === 'zone' ? 24 : 32),
        freqB: type === 'spiral' || type === 'logSpiral' ? 6 : 1,
        angle: current && type === 'lines' ? current.angle + 3 * DEG : 0,
        phase: 0,
        phaseCycles: 0,
        rotCycles: 0,
        profile: current?.profile ?? (type === 'zone' || type === 'spiral' || type === 'logSpiral' ? 'sinusoid' : 'ruling'),
        harmonics: current?.harmonics ?? 15,
        duty: type === 'dots' || type === 'hex' ? 0.62 : (current?.duty ?? 0.22),
        centerX: current && (type === 'zone' || type === 'rings') ? current.centerX + 0.04 : 0,
        centerY: 0,
        orbitR: 0,
        orbitCycles: 0,
        aspect: 1,
        warp: 0,
        warpFreq: 3,
        color: [1, 1, 1] as [number, number, number],
        colorize: 0,
      } satisfies Layer
      const index = current ? project.layers.indexOf(current) : project.layers.length - 1
      project.layers.splice(index + 1, 0, layer)
      bridge.setSelected(layer.id)
    })
  }

  function rebuildList(): void {
    metas.clear()
    names.clear()
    list.replaceChildren()
    for (const layer of bridge.project().layers) {
      const row = document.createElement('div')
      row.className = 'layer-row'
      row.dataset.id = layer.id
      const eye = document.createElement('button')
      eye.type = 'button'
      eye.className = 'icon eye'
      eye.textContent = layer.enabled ? '●' : '○'
      eye.title = 'Enable'
      eye.addEventListener('click', () => {
        bridge.begin()
        layer.enabled = !layer.enabled
        eye.textContent = layer.enabled ? '●' : '○'
        bridge.touch()
        bridge.end()
        markEnabled()
      })
      const main = document.createElement('button')
      main.type = 'button'
      main.className = 'layer-main'
      const name = document.createElement('span')
      name.className = 'layer-name'
      const swatch = document.createElement('i')
      swatch.className = 'swatch'
      swatch.style.setProperty('--swatch', layer.colorize > 0 ? hex(layer.color) : '#d9d3c7')
      const text = document.createElement('span')
      text.textContent = layer.name
      name.append(swatch, text)
      const meta = document.createElement('span')
      meta.className = 'layer-meta'
      main.append(name, meta)
      main.addEventListener('click', () => select(layer.id))
      const actions = document.createElement('div')
      actions.className = 'layer-actions'
      actions.append(
        small('↑', 'Move up', () => move(layer.id, -1)),
        small('↓', 'Move down', () => move(layer.id, 1)),
        small('⧉', 'Duplicate', () => duplicate(layer.id)),
        small('×', 'Remove', () => remove(layer.id)),
      )
      row.append(eye, main, actions)
      list.append(row)
      metas.set(layer.id, meta)
      names.set(layer.id, text)
    }
    markSelected()
    markEnabled()
    addButton.disabled = bridge.project().layers.length >= MAX_LAYERS
  }

  function small(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.title = title
    button.addEventListener('click', onClick)
    return button
  }

  function move(id: string, direction: number): void {
    bridge.structural(() => {
      const layers = bridge.project().layers
      const index = layers.findIndex((layer) => layer.id === id)
      const next = index + direction
      if (index < 0 || next < 0 || next >= layers.length) return
      const [layer] = layers.splice(index, 1)
      layers.splice(next, 0, layer)
    })
  }

  function duplicate(id: string): void {
    const project = bridge.project()
    if (project.layers.length >= MAX_LAYERS) return
    bridge.structural(() => {
      const index = project.layers.findIndex((layer) => layer.id === id)
      const source = project.layers[index]
      if (!source) return
      const copy: Layer = {
        ...source,
        color: [source.color[0], source.color[1], source.color[2]],
        id: nextId(),
        name: `${source.name} copy`,
      }
      project.layers.splice(index + 1, 0, copy)
      bridge.setSelected(copy.id)
    })
  }

  function remove(id: string): void {
    const project = bridge.project()
    if (project.layers.length <= 1) return
    bridge.structural(() => {
      const index = project.layers.findIndex((layer) => layer.id === id)
      if (index < 0) return
      project.layers.splice(index, 1)
      const next = project.layers[Math.max(0, index - 1)]
      bridge.setSelected(next.id)
    })
  }

  function syncVisibility(layer: Layer): void {
    const visible = controlsFor(layer)
    for (const row of inspector.querySelectorAll<HTMLElement>('[data-control]')) {
      const control = row.dataset.control as ControlId
      row.hidden = !visible.has(control)
    }
    const freq = inspector.querySelector<HTMLElement>('[data-control="freq"] .label')
    const freqB = inspector.querySelector<HTMLElement>('[data-control="freqB"] .label')
    const duty = inspector.querySelector<HTMLElement>('[data-control="duty"] .label')
    const profile = inspector.querySelector<HTMLElement>('[data-control="profile"] .label')
    const profileSelect = inspector.querySelector<HTMLSelectElement>('[data-control="profile"] select')
    if (freq) freq.textContent = freqLabel(layer)
    if (freqB) freqB.textContent = freqBLabel(layer)
    if (duty) duty.textContent = dutyLabel(layer)
    if (profile) profile.textContent = profileLabel(layer)
    if (profileSelect) {
      const dots = layer.type === 'dots' || layer.type === 'hex'
      profileSelect.options[0].textContent = dots ? 'Soft' : 'Sinusoid'
      profileSelect.options[1].textContent = dots ? 'Hard' : 'Ruling'
    }
    const formula = document.querySelector('#formula')
    if (formula) formula.textContent = formulaFor(layer)
  }

  function rebuildInspector(): void {
    refreshers.clear()
    beatKey = ''
    inspector.replaceChildren()
    const layer = selectedLayer(bridge)
    const project = bridge.project()
    if (!layer) return

    const head = document.createElement('div')
    head.className = 'inspector-head'
    const title = document.createElement('h2')
    title.textContent = 'Layer'
    const actions = document.createElement('div')
    actions.className = 'row-actions'
    const dup = document.createElement('button')
    dup.type = 'button'
    dup.textContent = 'Duplicate'
    dup.addEventListener('click', () => duplicate(layer.id))
    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = 'Remove'
    del.addEventListener('click', () => remove(layer.id))
    actions.append(dup, del)
    head.append(title, actions)
    inspector.append(head)

    const name = document.createElement('input')
    name.className = 'name-input'
    name.value = layer.name
    name.maxLength = 48
    name.addEventListener('focus', () => bridge.begin())
    name.addEventListener('input', () => {
      layer.name = name.value
      const node = names.get(layer.id)
      if (node) node.textContent = layer.name
      bridge.touch()
    })
    name.addEventListener('blur', () => bridge.end())
    inspector.append(name)

    const typeRow = document.createElement('label')
    typeRow.className = 'field choice'
    const typeLabel = document.createElement('span')
    typeLabel.className = 'label'
    typeLabel.textContent = 'Type'
    const type = document.createElement('select')
    for (const kind of LAYER_TYPES) {
      const option = document.createElement('option')
      option.value = kind
      option.textContent = TYPE_LABEL[kind]
      type.append(option)
    }
    type.value = layer.type
    bindGesture(type)
    type.addEventListener('change', () => {
      layer.type = type.value as LayerType
      syncVisibility(layer)
      bridge.touch()
    })
    typeRow.append(typeLabel, type)
    inspector.append(typeRow)

    addCheck(inspector, 'Enabled', () => layer.enabled, (value) => {
      layer.enabled = value
    })
    addRange(inspector, {
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.01,
      get: () => layer.opacity,
      set: (value) => {
        layer.opacity = value
      },
    })
    addRange(inspector, {
      key: 'freq',
      control: 'freq',
      label: freqLabel(layer),
      min: 0,
      max: 240,
      step: 0.1,
      get: () => layer.freq,
      set: (value) => {
        layer.freq = value
      },
    })
    addRange(inspector, {
      control: 'freqB',
      label: freqBLabel(layer),
      min: 0,
      max: 64,
      step: 1,
      get: () => layer.freqB,
      set: (value) => {
        layer.freqB = value
      },
    })
    addRange(inspector, {
      key: 'angle',
      control: 'angle',
      label: 'Angle °',
      min: -180,
      max: 180,
      step: 0.1,
      get: () => layer.angle / DEG,
      set: (value) => {
        layer.angle = value * DEG
      },
    })
    addRange(inspector, {
      control: 'phase',
      label: 'Phase °',
      min: -180,
      max: 180,
      step: 0.1,
      get: () => layer.phase / DEG,
      set: (value) => {
        layer.phase = value * DEG
      },
    })
    addNumber(inspector, {
      control: 'phaseCycles',
      label: 'Phase cycles',
      hz: 'phase',
      min: -48,
      max: 48,
      step: 1,
      get: () => layer.phaseCycles,
      set: (value) => {
        layer.phaseCycles = value
      },
    })
    addNumber(inspector, {
      control: 'rotCycles',
      label: 'Rotation cycles',
      hz: 'rot',
      min: -48,
      max: 48,
      step: 1,
      get: () => layer.rotCycles,
      set: (value) => {
        layer.rotCycles = value
      },
    })

    const profileRow = document.createElement('label')
    profileRow.className = 'field choice'
    profileRow.dataset.control = 'profile'
    const profileName = document.createElement('span')
    profileName.className = 'label'
    profileName.textContent = profileLabel(layer)
    const profile = document.createElement('select')
    const soft = document.createElement('option')
    soft.value = 'sinusoid'
    soft.textContent = layer.type === 'dots' || layer.type === 'hex' ? 'Soft' : 'Sinusoid'
    const hard = document.createElement('option')
    hard.value = 'ruling'
    hard.textContent = layer.type === 'dots' || layer.type === 'hex' ? 'Hard' : 'Ruling'
    profile.append(soft, hard)
    profile.value = layer.profile
    bindGesture(profile)
    profile.addEventListener('change', () => {
      layer.profile = profile.value === 'ruling' ? 'ruling' : 'sinusoid'
      syncVisibility(layer)
      bridge.touch()
    })
    profileRow.append(profileName, profile)
    inspector.append(profileRow)

    addRange(inspector, {
      control: 'harmonics',
      label: 'Harmonics',
      min: 1,
      max: 24,
      step: 1,
      get: () => layer.harmonics,
      set: (value) => {
        layer.harmonics = Math.round(value)
      },
    })
    addRange(inspector, {
      key: 'duty',
      control: 'duty',
      label: dutyLabel(layer),
      min: 0.02,
      max: 0.98,
      step: 0.01,
      get: () => layer.duty,
      set: (value) => {
        layer.duty = value
      },
    })
    addRange(inspector, {
      key: 'centerX',
      control: 'center',
      label: 'Center X',
      min: -1,
      max: 1,
      step: 0.001,
      get: () => layer.centerX,
      set: (value) => {
        layer.centerX = value
      },
    })
    addRange(inspector, {
      key: 'centerY',
      control: 'center',
      label: 'Center Y',
      min: -1,
      max: 1,
      step: 0.001,
      get: () => layer.centerY,
      set: (value) => {
        layer.centerY = value
      },
    })
    addRange(inspector, {
      control: 'orbit',
      label: 'Orbit radius',
      min: 0,
      max: 0.75,
      step: 0.001,
      get: () => layer.orbitR,
      set: (value) => {
        layer.orbitR = value
      },
    })
    addNumber(inspector, {
      control: 'orbit',
      label: 'Orbit cycles',
      hz: 'orbit',
      min: -24,
      max: 24,
      step: 1,
      get: () => layer.orbitCycles,
      set: (value) => {
        layer.orbitCycles = value
      },
    })
    addRange(inspector, {
      control: 'aspect',
      label: 'Y scale',
      min: 0.05,
      max: 4,
      step: 0.01,
      get: () => layer.aspect,
      set: (value) => {
        layer.aspect = value
      },
    })
    addRange(inspector, {
      control: 'warp',
      label: 'Warp',
      min: -0.2,
      max: 0.2,
      step: 0.001,
      get: () => layer.warp,
      set: (value) => {
        layer.warp = value
      },
    })
    addRange(inspector, {
      control: 'warp',
      label: 'Warp cycles',
      min: 0,
      max: 24,
      step: 0.1,
      get: () => layer.warpFreq,
      set: (value) => {
        layer.warpFreq = value
      },
    })

    const colorRow = document.createElement('label')
    colorRow.className = 'field'
    colorRow.dataset.control = 'color'
    const colorLabel = document.createElement('span')
    colorLabel.className = 'label'
    colorLabel.textContent = 'Gel'
    const color = document.createElement('input')
    color.type = 'color'
    color.value = hex(layer.color)
    bindGesture(color)
    color.addEventListener('input', () => {
      layer.color = rgb(color.value)
      bridge.touch()
      rebuildList()
    })
    colorRow.append(colorLabel, color)
    inspector.append(colorRow)
    addRange(inspector, {
      control: 'color',
      label: 'Gel amount',
      min: 0,
      max: 1,
      step: 0.01,
      get: () => layer.colorize,
      set: (value) => {
        layer.colorize = value
        rebuildList()
      },
    })

    const formula = document.createElement('p')
    formula.id = 'formula'
    formula.className = 'formula'
    formula.textContent = formulaFor(layer)
    inspector.append(formula)
    const beats = document.createElement('div')
    beats.id = 'beats'
    beats.className = 'beats'
    inspector.append(beats)
    beatKey = ''

    const stack = document.createElement('h2')
    stack.textContent = 'Stack'
    inspector.append(stack)
    const blendRow = document.createElement('label')
    blendRow.className = 'field choice'
    const blendLabel = document.createElement('span')
    blendLabel.className = 'label'
    blendLabel.textContent = 'Combine'
    const blend = document.createElement('select')
    for (const mode of Object.keys(BLEND_LABEL) as Array<keyof typeof BLEND_LABEL>) {
      const option = document.createElement('option')
      option.value = mode
      option.textContent = BLEND_LABEL[mode]
      blend.append(option)
    }
    blend.value = project.blend
    const blendNote = document.createElement('p')
    blendNote.className = 'note'
    blendNote.textContent = BLEND_NOTE[project.blend]
    bindGesture(blend)
    blend.addEventListener('change', () => {
      project.blend = blend.value as Project['blend']
      blendNote.textContent = BLEND_NOTE[project.blend]
      bridge.touch()
    })
    blendRow.append(blendLabel, blend)
    inspector.append(blendRow, blendNote)

    addRange(inspector, { label: 'Exposure', min: 0.2, max: 4, step: 0.01, get: () => project.exposure, set: (v) => { project.exposure = v } })
    addRange(inspector, { label: 'Contrast', min: 0.2, max: 3, step: 0.01, get: () => project.contrast, set: (v) => { project.contrast = v } })
    addRange(inspector, { label: 'Gamma', min: 0.3, max: 2.5, step: 0.01, get: () => project.gamma, set: (v) => { project.gamma = v } })
    addRange(inspector, { label: 'Saturation', min: 0, max: 2, step: 0.01, get: () => project.saturation, set: (v) => { project.saturation = v } })
    addCheck(inspector, 'Invert', () => project.invert, (value) => { project.invert = value })
    addRange(inspector, { label: 'Threshold', min: 0, max: 1, step: 0.01, get: () => project.threshold, set: (v) => { project.threshold = v } })

    const optics = document.createElement('h2')
    optics.textContent = 'Optics'
    inspector.append(optics)
    addRange(inspector, { label: 'Vignette', min: 0, max: 1, step: 0.01, get: () => project.vignette, set: (v) => { project.vignette = v } })
    addRange(inspector, { label: 'Iris', min: 0, max: 1.2, step: 0.01, get: () => project.iris, set: (v) => { project.iris = v } })
    addRange(inspector, { label: 'Chromatic', min: 0, max: 0.03, step: 0.0005, get: () => project.chroma, set: (v) => { project.chroma = v } })
    const sampleRow = document.createElement('label')
    sampleRow.className = 'field choice'
    const sampleLabel = document.createElement('span')
    sampleLabel.className = 'label'
    sampleLabel.textContent = 'Samples'
    const samples = document.createElement('select')
    for (const count of [1, 2, 3, 4]) {
      const option = document.createElement('option')
      option.value = String(count)
      option.textContent = `${count}×${count} integral`
      samples.append(option)
    }
    samples.value = String(Math.max(1, Math.min(4, Math.round(project.samples))))
    bindGesture(samples)
    samples.addEventListener('change', () => {
      project.samples = Number(samples.value)
      bridge.touch()
    })
    sampleRow.append(sampleLabel, samples)
    inspector.append(sampleRow)
    const sampleNote = document.createElement('p')
    sampleNote.className = 'note'
    sampleNote.textContent = 'Each pixel averages the product on an N×N grid. That is the pixel integral of the stack, not a blur added afterward.'
    inspector.append(sampleNote)

    const field = document.createElement('h2')
    field.textContent = 'Field'
    inspector.append(field)
    addRange(inspector, { label: 'Scale', min: 0.1, max: 6, step: 0.01, get: () => project.globalScale, set: (v) => { project.globalScale = v } })
    addRange(inspector, { label: 'Scale pulse', min: 0, max: 0.85, step: 0.01, get: () => project.pulseAmp, set: (v) => { project.pulseAmp = v } })
    addNumber(inspector, { label: 'Pulse cycles', min: -12, max: 12, step: 1, get: () => project.pulseCycles, set: (v) => { project.pulseCycles = v } })
    addRange(inspector, {
      label: 'Rotation °',
      min: -180,
      max: 180,
      step: 0.1,
      get: () => project.globalRot / DEG,
      set: (v) => { project.globalRot = v * DEG },
    })
    addNumber(inspector, { label: 'Rotation cycles', min: -12, max: 12, step: 1, get: () => project.globalRotCycles, set: (v) => { project.globalRotCycles = v } })
    addNumber(inspector, { label: 'Kaleidoscope', min: 0, max: 16, step: 1, get: () => project.kaleido, set: (v) => { project.kaleido = v } })
    addNumber(inspector, { label: 'Tile', min: 0, max: 8, step: 1, get: () => project.tile, set: (v) => { project.tile = v } })
    const fieldNote = document.createElement('p')
    fieldNote.className = 'note'
    fieldNote.textContent = 'The short side of the frame is 1 unit. Origin at center, y up. Kaleidoscope 0 is off; 2 or more is the sector count. Tile 0 is off.'
    inspector.append(fieldNote)
    syncVisibility(layer)
  }

  function footerNumber(input: HTMLInputElement, apply: (value: number) => void): void {
    bindGesture(input)
    input.addEventListener('input', () => {
      const value = Number(input.value)
      if (!Number.isFinite(value)) return
      apply(value)
      bridge.touch()
    })
  }
  footerNumber(loopSeconds, (value) => {
    bridge.project().loopSeconds = Math.max(0.5, value)
  })
  footerNumber(playback, (value) => {
    bridge.project().playback = Math.max(0.05, value)
  })
  footerNumber(motion, (value) => {
    bridge.project().motion = value
  })

  let wasPlaying = false
  scrub.addEventListener('pointerdown', () => {
    scrubbing = true
    wasPlaying = bridge.playing()
    bridge.setPlaying(false)
  })
  scrub.addEventListener('input', () => bridge.setTime(Number(scrub.value)))
  const endScrub = () => {
    if (!scrubbing) return
    scrubbing = false
    bridge.setPlaying(wasPlaying)
  }
  scrub.addEventListener('pointerup', endScrub)
  scrub.addEventListener('pointercancel', endScrub)
  scrub.addEventListener('blur', endScrub)

  play.addEventListener('click', () => bridge.setPlaying(!bridge.playing()))
  png.addEventListener('click', () => bridge.png())
  gif.addEventListener('click', () => bridge.gif())
  webm.addEventListener('click', () => bridge.webm())
  mp4.addEventListener('click', () => bridge.mp4())
  document.querySelector('#json-save')?.addEventListener('click', () => bridge.saveJson())
  document.querySelector('#json-load')?.addEventListener('click', () => file.click())
  document.querySelector('#snap')?.addEventListener('click', () => bridge.snap())
  document.querySelector('#project')?.addEventListener('click', () => bridge.projection())
  document.querySelector('#exit-projection')?.addEventListener('click', () => bridge.projection())
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]
    file.value = ''
    if (!chosen) return
    bridge.loadJsonText(await chosen.text())
  })

  function setSize(width: number, height: number): void {
    exportW.value = String(width)
    exportH.value = String(height)
    saveExport()
  }
  document.querySelector('#size-square')?.addEventListener('click', () => setSize(1080, 1080))
  document.querySelector('#size-hd')?.addEventListener('click', () => setSize(1920, 1080))
  document.querySelector('#size-story')?.addEventListener('click', () => setSize(1080, 1920))
  for (const input of [exportW, exportH, exportFrames, exportFps]) {
    input.addEventListener('change', saveExport)
  }

  function saveExport(): void {
    localStorage.setItem(
      EXPORT_KEY,
      JSON.stringify({
        width: Number(exportW.value),
        height: Number(exportH.value),
        frames: Number(exportFrames.value),
        fps: Number(exportFps.value),
      }),
    )
  }
  try {
    const saved = JSON.parse(localStorage.getItem(EXPORT_KEY) ?? '')
    if (saved && typeof saved === 'object') {
      if (Number.isFinite(saved.width)) exportW.value = String(saved.width)
      if (Number.isFinite(saved.height)) exportH.value = String(saved.height)
      if (Number.isFinite(saved.frames)) exportFrames.value = String(saved.frames)
      if (Number.isFinite(saved.fps)) exportFps.value = String(saved.fps)
    }
  } catch {
    /* keep the defaults in the page */
  }

  function readExport(input: HTMLInputElement, fallback: number, max: number): number {
    return readCount(input, fallback, 16, max)
  }

  function readCount(input: HTMLInputElement, fallback: number, min: number, max: number): number {
    const value = Math.round(Number(input.value))
    if (!Number.isFinite(value)) return fallback
    return Math.max(min, Math.min(max, value))
  }

  function updateLive(time: number): void {
    if (!scrubbing) scrub.value = String(time)
    phaseRead.textContent = time.toFixed(3)
    const project = bridge.project()
    const exact = loopIsExact(project)
    loopFlag.textContent = exact ? 'Loop closes' : 'Loop does not close'
    loopFlag.className = exact ? 'loop-flag exact' : 'loop-flag inexact'
    for (const layer of project.layers) {
      const meta = metas.get(layer.id)
      if (!meta) continue
      const angle = (liveLayer(layer, project, time).angle * 180) / Math.PI
      meta.textContent = `${fmt(layer.freq)} · ${fmt(angle)}°`
    }
    const layer = selectedLayer(bridge)
    if (layer) {
      const rates: Record<string, number> = {
        phase: hz(layer.phaseCycles, project),
        rot: hz(layer.rotCycles, project),
        orbit: hz(layer.orbitCycles, project),
      }
      for (const node of inspector.querySelectorAll<HTMLElement>('[data-hz]')) {
        const key = node.dataset.hz ?? ''
        node.textContent = `${rates[key]?.toFixed(2) ?? '0.00'} Hz`
      }
    }
    const rows = beatRows(project, time)
    const key = rows.map((row) => `${row.title}:${row.detail}`).join('|')
    if (key === beatKey) return
    beatKey = key
    const beats = document.querySelector('#beats')
    if (!beats) return
    beats.replaceChildren()
    if (rows.length === 0) {
      beats.textContent = 'The beat of two line gratings, zone plates, spokes, or rings is shown here.'
      return
    }
    for (const row of rows) {
      const paragraph = document.createElement('p')
      const title = document.createElement('strong')
      title.textContent = row.title
      paragraph.append(title, document.createTextNode(` ${row.detail}`))
      beats.append(paragraph)
    }
  }

  return {
    rebuildList,
    rebuildInspector,
    syncGlobals: () => {
      const project = bridge.project()
      loopSeconds.value = String(project.loopSeconds)
      playback.value = String(project.playback)
      motion.value = String(project.motion)
    },
    updateLive,
    setPlaying: (playing) => {
      play.textContent = playing ? 'Pause' : 'Play'
    },
    setPreset: (id) => {
      preset.value = id
    },
    setStatus: (text) => {
      status.textContent = text
    },
    setBusy: (busy) => {
      png.disabled = busy
      gif.disabled = busy
      webm.disabled = busy
      mp4.disabled = busy
    },
    exportSettings: () => ({
      width: readExport(exportW, 1080, 3840),
      height: readExport(exportH, 1080, 3840),
      frames: readCount(exportFrames, 48, 2, 4000),
      fps: readCount(exportFps, 60, 1, 120),
    }),
    setCenter: (x, y) => {
      refreshers.get('centerX')?.()
      refreshers.get('centerY')?.()
      void x
      void y
    },
    syncLayerSliders: () => {
      for (const refresh of refreshers.values()) refresh()
    },
    select,
  }
}


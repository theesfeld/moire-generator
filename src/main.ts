import { Engine } from './engine'
import { download, exportGif, exportPng, exportVideo, stamp, type VideoContainer } from './export'
import { DEG, clamp, wrap01 } from './math'
import { liveLayer } from './grating'
import { sanitizeProject, snapProjectToLoop, loopIsExact } from './model'
import { presetById } from './presets'
import { probeShader } from './probe'
import { selfTest } from './selftest'
import { bufferToRaw, patternToBuffer, rawToPattern } from './transform'
import type { Project } from './types'
import { createView, type View } from './ui'

const STORAGE_KEY = 'moire.project.v1'
const params = new URLSearchParams(location.search)
const isolated = params.has('preset') || params.has('probe')

function loadSaved(): { project: Project; selectedId?: string } | null {
  if (isolated) return null
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    const project = sanitizeProject(raw.project ?? raw)
    if (!project) return null
    return { project, selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : undefined }
  } catch {
    return null
  }
}

const saved = loadSaved()
let project: Project = params.has('preset')
  ? presetById(params.get('preset') ?? 'angle').build()
  : (saved?.project ?? presetById('angle').build())
let selectedId = project.layers.some((layer) => layer.id === saved?.selectedId)
  ? (saved?.selectedId as string)
  : project.layers[0].id
let time = params.has('time') ? wrap01(Number(params.get('time'))) : 0
let playing = !params.has('pause')
let exporting = false
let gesture = false
const past: string[] = []
const future: string[] = []
const screen: { view?: View } = {}

function ui(): View {
  if (!screen.view) throw new Error('The interface is not ready')
  return screen.view
}

const stage = document.querySelector('#stage') as HTMLElement
const canvas = document.querySelector('#view') as HTMLCanvasElement
const overlay = document.querySelector('#overlay') as HTMLCanvasElement
const overlayContext = overlay.getContext('2d')

function showBanner(text: string): void {
  const banner = document.createElement('div')
  banner.className = 'banner'
  banner.textContent = text
  document.body.prepend(banner)
}

const failures = selfTest()
if (failures.length) showBanner(failures.join(' · '))

let engine: Engine
try {
  engine = new Engine(canvas)
} catch (error) {
  const message = error instanceof Error ? error.message : 'WebGL2 failed'
  showBanner(message)
  const probe = document.querySelector<HTMLElement>('#probe')
  if (probe) {
    probe.hidden = false
    probe.textContent = message
  }
  document.title = 'PROBE FAIL'
  throw error
}

function persist(): void {
  if (isolated) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, project, selectedId }))
}

function snapshot(): void {
  const serialized = JSON.stringify(project)
  if (past[past.length - 1] === serialized) return
  past.push(serialized)
  if (past.length > 60) past.shift()
  future.length = 0
}

function restore(serialized: string): void {
  const next = sanitizeProject(JSON.parse(serialized))
  if (!next) return
  project = next
  if (!project.layers.some((layer) => layer.id === selectedId)) selectedId = project.layers[0].id
  persist()
  ui().rebuildList()
  ui().rebuildInspector()
  ui().syncGlobals()
}

function undo(): void {
  const previous = past.pop()
  if (!previous) return
  future.push(JSON.stringify(project))
  restore(previous)
}

function redo(): void {
  const next = future.pop()
  if (!next) return
  past.push(JSON.stringify(project))
  restore(next)
}

function beginGesture(): void {
  if (gesture) return
  gesture = true
  snapshot()
}

function endGesture(): void {
  gesture = false
}

function loadJsonText(text: string): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    ui().setStatus('That file is not JSON')
    return
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as { project?: unknown }) : null
  const next = sanitizeProject(record?.project ?? parsed)
  if (!next) {
    ui().setStatus('That file is not a moiré project')
    return
  }
  snapshot()
  project = next
  selectedId = project.layers[0].id
  persist()
  ui().setPreset('')
  ui().rebuildList()
  ui().rebuildInspector()
  ui().syncGlobals()
  ui().setStatus('Loaded project')
}

function savedStatus(exact: boolean, summary: string): string {
  return exact
    ? `Saved ${summary}. The phase returns to the first frame.`
    : `Saved ${summary}. Cycle counts are not integers, so the join is visible.`
}

function exportMotion(container: VideoContainer): void {
  if (exporting) return
  const size = ui().exportSettings()
  exporting = true
  ui().setBusy(true)
  const exact = loopIsExact(project)
  const label = container === 'webm' ? 'WebM' : 'MP4'
  void exportVideo(engine, project, size.width, size.height, size.fps, container, (text) => ui().setStatus(text))
    .then((summary) => ui().setStatus(savedStatus(exact, summary)))
    .catch((error: unknown) => ui().setStatus(error instanceof Error ? error.message : `${label} export failed`))
    .finally(() => {
      exporting = false
      ui().setBusy(false)
    })
}

function enterProjection(): void {
  document.body.classList.add('projection')
  void document.documentElement.requestFullscreen().catch(() => undefined)
}

function exitProjection(): void {
  document.body.classList.remove('projection', 'hide-cursor')
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

screen.view = createView({
  project: () => project,
  selectedId: () => selectedId,
  setSelected: (id) => {
    selectedId = id
  },
  playing: () => playing,
  setPlaying: (next) => {
    playing = next
    ui().setPlaying(next)
  },
  setTime: (next) => {
    time = wrap01(next)
  },
  begin: beginGesture,
  touch: persist,
  end: endGesture,
  structural: (edit) => {
    if (!gesture) snapshot()
    edit()
    gesture = false
    persist()
    ui().rebuildList()
    ui().rebuildInspector()
  },
  preset: (id) => {
    snapshot()
    project = presetById(id).build()
    selectedId = project.layers[0].id
    persist()
    ui().setPreset(id)
    ui().rebuildList()
    ui().rebuildInspector()
    ui().syncGlobals()
  },
  png: () => {
    if (exporting) return
    const size = ui().exportSettings()
    exporting = true
    ui().setBusy(true)
    ui().setStatus('Rendering PNG')
    void exportPng(engine, project, time, size.width, size.height)
      .then(() => ui().setStatus('Saved PNG'))
      .catch((error: unknown) => ui().setStatus(error instanceof Error ? error.message : 'PNG export failed'))
      .finally(() => {
        exporting = false
        ui().setBusy(false)
      })
  },
  gif: () => {
    if (exporting) return
    const size = ui().exportSettings()
    exporting = true
    ui().setBusy(true)
    const exact = loopIsExact(project)
    void exportGif(engine, project, size.width, size.height, size.frames, (text) => ui().setStatus(text))
      .then((summary) => ui().setStatus(savedStatus(exact, summary)))
      .catch((error: unknown) => ui().setStatus(error instanceof Error ? error.message : 'GIF export failed'))
      .finally(() => {
        exporting = false
        ui().setBusy(false)
      })
  },
  webm: () => exportMotion('webm'),
  mp4: () => exportMotion('mp4'),
  saveJson: () => {
    const blob = new Blob([JSON.stringify({ kind: 'moire', version: 1, project }, null, 2)], {
      type: 'application/json',
    })
    download(blob, `moire-${stamp()}.json`)
  },
  loadJsonText,
  snap: () => {
    snapshot()
    snapProjectToLoop(project)
    gesture = false
    persist()
    ui().rebuildInspector()
    ui().syncGlobals()
  },
  projection: () => {
    if (document.body.classList.contains('projection')) exitProjection()
    else enterProjection()
  },
})

const view = screen.view
view.rebuildList()
view.rebuildInspector()
view.syncGlobals()
view.setPlaying(playing)
if (params.has('preset')) view.setPreset(params.get('preset') ?? 'angle')
else if (!saved) view.setPreset('angle')

function resize(): void {
  const rect = stage.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    overlay.width = width
    overlay.height = height
  }
}
new ResizeObserver(resize).observe(stage)
resize()

function drawOverlay(): void {
  if (!overlayContext) return
  const width = overlay.width
  const height = overlay.height
  overlayContext.clearRect(0, 0, width, height)
  if (document.body.classList.contains('projection')) return
  const scale = width / Math.max(1, stage.clientWidth)
  for (const layer of project.layers) {
    const live = liveLayer(layer, project, time)
    const points = patternToBuffer(live.centerX, live.centerY, project, time, width, height)
    const selected = layer.id === selectedId
    overlayContext.strokeStyle = selected ? '#e6a44b' : 'rgba(243, 239, 230, 0.4)'
    overlayContext.lineWidth = (selected ? 1.5 : 1) * scale
    const arm = (selected ? 12 : 7) * scale
    for (const point of points) {
      overlayContext.beginPath()
      overlayContext.moveTo(point.x - arm, point.y)
      overlayContext.lineTo(point.x + arm, point.y)
      overlayContext.moveTo(point.x, point.y - arm)
      overlayContext.lineTo(point.x, point.y + arm)
      overlayContext.stroke()
    }
  }
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (playing && !exporting) time = wrap01(time + (dt * project.playback) / Math.max(0.25, project.loopSeconds))
  if (!exporting && canvas.width > 0 && canvas.height > 0) {
    engine.render(project, time)
    drawOverlay()
  }
  view.updateLive(time)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

function pointerBuffer(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
  }
}

function patternAt(bufX: number, bufY: number): { x: number; y: number } {
  const raw = bufferToRaw(bufX, bufY, canvas.width, canvas.height)
  return rawToPattern(raw.x, raw.y, project, time)
}

let drag: { id: string; dx: number; dy: number } | null = null

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  const buffer = pointerBuffer(event)
  const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width)
  let hit: string | null = null
  let best = 16 * scale
  for (const layer of project.layers) {
    const live = liveLayer(layer, project, time)
    for (const point of patternToBuffer(live.centerX, live.centerY, project, time, canvas.width, canvas.height)) {
      const distance = Math.hypot(point.x - buffer.x, point.y - buffer.y)
      if (distance <= best) {
        best = distance
        hit = layer.id
      }
    }
  }
  const id = hit ?? selectedId
  view.select(id)
  const layer = project.layers.find((item) => item.id === id)
  if (!layer) return
  const live = liveLayer(layer, project, time)
  const pattern = patternAt(buffer.x, buffer.y)
  drag = { id, dx: live.centerX - pattern.x, dy: live.centerY - pattern.y }
  beginGesture()
  stage.setPointerCapture(event.pointerId)
})

stage.addEventListener('pointermove', (event) => {
  if (!drag) return
  const layer = project.layers.find((item) => item.id === drag?.id)
  if (!layer) return
  const buffer = pointerBuffer(event)
  const pattern = patternAt(buffer.x, buffer.y)
  const orbit = Math.PI * 2 * layer.orbitCycles * project.motion * time
  layer.centerX = pattern.x + drag.dx - layer.orbitR * Math.cos(orbit)
  layer.centerY = pattern.y + drag.dy - layer.orbitR * Math.sin(orbit)
  view.setCenter(layer.centerX, layer.centerY)
  persist()
})

stage.addEventListener('pointerup', () => {
  if (!drag) return
  drag = null
  endGesture()
})
stage.addEventListener('pointercancel', () => {
  drag = null
  endGesture()
})

let wheelTimer = 0
stage.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) return
    const layer = project.layers.find((item) => item.id === selectedId)
    if (!layer) return
    event.preventDefault()
    if (!wheelTimer) beginGesture()
    const direction = Math.sign(event.deltaY) || Math.sign(event.deltaX)
    if (!direction) return
    if (event.shiftKey) layer.angle += direction * -0.5 * DEG
    else if (event.altKey) layer.duty = clamp(layer.duty - direction * 0.01, 0.02, 0.98)
    else layer.freq = Math.max(0, layer.freq - direction * (Math.abs(event.deltaY) > 40 ? 1 : 0.25))
    view.syncLayerSliders()
    persist()
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(() => {
      wheelTimer = 0
      endGesture()
    }, 180)
  },
  { passive: false },
)

window.addEventListener('keydown', (event) => {
  const target = event.target
  const typing =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    if (typing) return
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    if (typing) return
    event.preventDefault()
    redo()
    return
  }
  if (typing) {
    if (event.key === 'Escape') (target as HTMLElement).blur()
    return
  }
  if (event.key === ' ' && !(target instanceof HTMLButtonElement)) {
    event.preventDefault()
    playing = !playing
    view.setPlaying(playing)
  } else if (event.key === 'f' || event.key === 'F') {
    if (document.body.classList.contains('projection')) exitProjection()
    else enterProjection()
  } else if (event.key === 'h' || event.key === 'H') {
    document.body.classList.toggle('chrome-hidden')
  } else if (event.key === '[' || event.key === ']') {
    const layers = project.layers
    const index = layers.findIndex((layer) => layer.id === selectedId)
    const next = (index + (event.key === ']' ? 1 : -1) + layers.length) % layers.length
    view.select(layers[next].id)
  } else if (event.key === '0') {
    time = 0
  }
})

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('projection', 'hide-cursor')
})

let cursorTimer = 0
window.addEventListener('pointermove', () => {
  document.body.classList.remove('hide-cursor')
  window.clearTimeout(cursorTimer)
  if (!document.body.classList.contains('projection')) return
  cursorTimer = window.setTimeout(() => document.body.classList.add('hide-cursor'), 1500)
})

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => {
  event.preventDefault()
  const dropped = event.dataTransfer?.files?.[0]
  if (!dropped) return
  void dropped.text().then(loadJsonText)
})

if (params.has('probe')) {
  const lines = [...failures]
  try {
    lines.push(...probeShader(engine))
  } catch (error) {
    lines.push(error instanceof Error ? error.message : 'probe failed')
  }
  const failed = lines.some((line) => !line.includes(' ok '))
  const probe = document.querySelector<HTMLElement>('#probe')
  if (probe) {
    probe.hidden = false
    probe.textContent = lines.join('\n')
  }
  document.title = failed ? 'PROBE FAIL' : 'PROBE OK'
}

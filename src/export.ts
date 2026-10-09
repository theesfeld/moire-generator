import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from 'mediabunny'
import { flipY, type Engine } from './engine'
import type { Project } from './types'

export function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export function download(bytes: Blob, filename: string): void {
  const url = URL.createObjectURL(bytes)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function rendersGray(project: Project): boolean {
  if (project.saturation <= 0.001 || project.threshold > 0) return true
  if (Math.abs(project.chroma) > 1e-4) return false
  return project.layers.every((layer) => {
    if (!layer.enabled || layer.colorize <= 0.01) return true
    const [r, g, b] = layer.color
    return Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02
  })
}

const GRAY_PALETTE: number[][] = Array.from({ length: 256 }, (_, value) => [value, value, value])

function grayIndex(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const index = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < index.length; i++, p += 4) {
    const y = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722
    index[i] = Math.max(0, Math.min(255, Math.round(y)))
  }
  return index
}

export async function exportPng(
  engine: Engine,
  project: Project,
  time: number,
  width: number,
  height: number,
): Promise<void> {
  const rgba = flipY(engine.readRaw(project, time, width, height), width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create an export canvas')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG export failed')
  download(blob, `moire-${stamp()}.png`)
}

export async function exportGif(
  engine: Engine,
  project: Project,
  width: number,
  height: number,
  frames: number,
  onProgress: (text: string) => void,
): Promise<string> {
  const gray = rendersGray(project)
  const delayCs = Math.max(2, Math.round((project.loopSeconds * 100) / frames))
  const delayMs = delayCs * 10
  let palette = GRAY_PALETTE

  if (!gray) {
    onProgress('Sampling color')
    const bucket: number[] = []
    const stride = 13
    for (const slot of [0, 0.25, 0.5, 0.75]) {
      const time = slot - Math.floor(slot)
      const frame = Math.min(frames - 1, Math.floor(time * frames))
      const rgba = flipY(engine.readRaw(project, frame / frames, width, height), width, height)
      for (let i = 0; i < width * height && bucket.length < 70_000 * 4; i += stride) {
        const p = i * 4
        bucket.push(rgba[p], rgba[p + 1], rgba[p + 2], 255)
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    palette = quantize(new Uint8Array(bucket), 256)
  }

  const gif = GIFEncoder({ initialCapacity: 1_048_576 })
  for (let frame = 0; frame < frames; frame++) {
    onProgress(`Frame ${frame + 1} / ${frames}`)
    const rgba = flipY(engine.readRaw(project, frame / frames, width, height), width, height)
    const index = gray ? grayIndex(rgba, width, height) : applyPalette(rgba, palette)
    gif.writeFrame(index, width, height, {
      palette: frame === 0 ? palette : undefined,
      delay: delayMs,
      repeat: 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  gif.finish()
  const raw = gif.bytes()
  const copy = new ArrayBuffer(raw.byteLength)
  new Uint8Array(copy).set(raw)
  download(new Blob([copy], { type: 'image/gif' }), `moire-${stamp()}.gif`)
  const seconds = (frames * delayMs) / 1000
  return `${frames} frames, ${seconds.toFixed(2)}s`
}

export type VideoContainer = 'webm' | 'mp4'

/** Codecs that need even dimensions. PNG and GIF keep the size in the fields. */
function evenSize(value: number): number {
  return Math.max(16, value - (value % 2))
}

export async function exportVideo(
  engine: Engine,
  project: Project,
  width: number,
  height: number,
  fps: number,
  container: VideoContainer,
  onProgress: (text: string) => void,
): Promise<string> {
  const w = evenSize(width)
  const h = evenSize(height)
  const frames = Math.max(2, Math.round(fps * project.loopSeconds))
  const frameDuration = project.loopSeconds / frames
  const frameRate = frames / project.loopSeconds
  const bitrate = Math.min(80_000_000, Math.max(4_000_000, Math.round(w * h * fps * 0.2)))
  const quality = new Quality({ bitrate })
  const label = container === 'webm' ? 'WebM' : 'MP4'
  const codecs: VideoCodec[] = container === 'webm' ? ['vp9', 'av1', 'vp8'] : ['avc', 'av1', 'hevc']
  const codec = await getFirstEncodableVideoCodec(codecs, { width: w, height: h, frameRate, quality })
  if (!codec) throw new Error(`This browser cannot encode ${label}.`)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not create an export canvas')
  const image = new ImageData(w, h)

  const target = new BufferTarget()
  const output = new Output({
    format: container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  const source = new CanvasSource(canvas, {
    codec,
    quality,
    latencyMode: 'quality',
    keyFrameInterval: 1,
    contentHint: 'detail',
    alpha: 'discard',
  })
  output.addVideoTrack(source, { frameRate })

  try {
    await output.start()
    for (let i = 0; i < frames; i++) {
      onProgress(`${label} ${i + 1} / ${frames}`)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const rgba = flipY(engine.readRaw(project, i / frames, w, h), w, h)
      image.data.set(rgba)
      context.putImageData(image, 0, 0)
      await source.add(i * frameDuration, frameDuration)
    }
    source.close()
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => undefined)
    throw error
  }

  const buffer = target.buffer
  if (!buffer) throw new Error(`${label} export produced no file`)
  const mime = container === 'webm' ? 'video/webm' : 'video/mp4'
  download(new Blob([buffer], { type: mime }), `moire-${stamp()}.${container}`)
  const sizeNote = w === width && h === height ? '' : `, ${w}×${h}`
  return `${frames} frames, ${project.loopSeconds.toFixed(2)}s, ${frameRate.toFixed(2)} fps${sizeNote}`
}

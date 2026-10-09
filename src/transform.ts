import { TAU, mod, rot } from './math'
import type { Project } from './types'

/** Global field transform. Mirrors the shader's coordinate block. */
export interface Frame {
  angle: number
  scale: number
  tile: number
  kaleido: number
}

export function frameOf(project: Project, time: number): Frame {
  const motion = project.motion
  const angle = project.globalRot + TAU * project.globalRotCycles * motion * time
  const pulse = 1 + project.pulseAmp * Math.sin(TAU * project.pulseCycles * motion * time)
  const scale = Math.max(project.globalScale * pulse, 0.02)
  const tile = project.tile >= 1.5 ? Math.min(24, Math.round(project.tile)) : 0
  const kaleido = project.kaleido >= 1.5 ? Math.min(32, Math.max(2, Math.round(project.kaleido))) : 0
  return { angle, scale, tile, kaleido }
}

/** Screen-buffer position (y down) to the raw field, before rotation and scale. */
export function bufferToRaw(
  bufX: number,
  bufY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const short = Math.min(width, height)
  return {
    x: (bufX - width / 2) / short,
    y: (height / 2 - bufY) / short,
  }
}

export function rawToBuffer(
  rawX: number,
  rawY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const short = Math.min(width, height)
  return {
    x: rawX * short + width / 2,
    y: height / 2 - rawY * short,
  }
}

/** Raw field (y up, short side = 1) through rotation, scale, tile, and kaleidoscope. */
export function rawToPattern(rawX: number, rawY: number, project: Project, time: number): { x: number; y: number } {
  const frame = frameOf(project, time)
  let p = rot(rawX, rawY, frame.angle)
  p = { x: p.x / frame.scale, y: p.y / frame.scale }
  if (frame.tile >= 2) {
    p = {
      x: mod(p.x * frame.tile + 0.5, 1) - 0.5,
      y: mod(p.y * frame.tile + 0.5, 1) - 0.5,
    }
  }
  if (frame.kaleido >= 2) {
    const r = Math.hypot(p.x, p.y)
    const sector = TAU / frame.kaleido
    let a = mod(Math.atan2(p.y, p.x), sector)
    a = Math.abs(a - sector * 0.5)
    p = { x: r * Math.cos(a), y: r * Math.sin(a) }
  }
  return p
}

/**
 * Where a pattern-space center lands on the buffer.
 * Tile and kaleidoscope are one-to-many, so every visible copy is returned.
 */
export function patternToBuffer(
  x: number,
  y: number,
  project: Project,
  time: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const frame = frameOf(project, time)
  const posts: { x: number; y: number }[] = []
  if (frame.kaleido >= 2) {
    const r = Math.hypot(x, y)
    const folded = Math.atan2(y, x)
    const sector = TAU / frame.kaleido
    for (let k = 0; k < frame.kaleido; k++) {
      for (const sign of [-1, 1]) {
        const a = k * sector + sector * 0.5 + sign * folded
        posts.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
      }
    }
  } else {
    posts.push({ x, y })
  }

  const pres: { x: number; y: number }[] = []
  if (frame.tile >= 2) {
    const n = frame.tile
    const span = n + 1
    for (const post of posts) {
      for (let ix = -span; ix <= span; ix++) {
        for (let iy = -span; iy <= span; iy++) {
          pres.push({ x: (post.x + ix) / n, y: (post.y + iy) / n })
        }
      }
    }
  } else {
    pres.push(...posts)
  }

  const points: { x: number; y: number }[] = []
  const seen = new Set<string>()
  for (const pre of pres) {
    const raw = rot(pre.x * frame.scale, pre.y * frame.scale, -frame.angle)
    const buf = rawToBuffer(raw.x, raw.y, width, height)
    if (buf.x < -24 || buf.y < -24 || buf.x > width + 24 || buf.y > height + 24) continue
    const key = `${Math.round(buf.x * 2)}:${Math.round(buf.y * 2)}`
    if (seen.has(key)) continue
    seen.add(key)
    points.push(buf)
  }
  return points
}

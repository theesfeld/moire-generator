import { fragmentSource, vertexSource } from './shader'
import { BLEND_INDEX, MAX_LAYERS, TYPE_INDEX, type Project } from './types'

const VERTEX = vertexSource
const FRAGMENT = fragmentSource(MAX_LAYERS)

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'shader compile failed'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

type Pack = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export class Engine {
  readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly loc = new Map<string, WebGLUniformLocation | null>()
  private readonly fbo: WebGLFramebuffer
  private readonly tex: WebGLTexture
  private readonly pack: Record<Pack, Float32Array>
  private fboW = 0
  private fboH = 0

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('WebGL2 is required')
    this.canvas = canvas
    this.gl = gl

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!program) throw new Error('Could not create the program')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'program link failed'
      gl.deleteProgram(program)
      throw new Error(log)
    }
    this.program = program

    const vao = gl.createVertexArray()
    if (!vao) throw new Error('Could not create a vertex array')
    this.vao = vao

    const fbo = gl.createFramebuffer()
    const tex = gl.createTexture()
    if (!fbo || !tex) throw new Error('Could not create the export target')
    this.fbo = fbo
    this.tex = tex

    const stride = MAX_LAYERS * 4
    this.pack = {
      A: new Float32Array(stride),
      B: new Float32Array(stride),
      C: new Float32Array(stride),
      D: new Float32Array(stride),
      E: new Float32Array(stride),
      F: new Float32Array(stride),
    }
  }

  private location(name: string): WebGLUniformLocation | null {
    let loc = this.loc.get(name)
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(this.program, name)
      this.loc.set(name, loc)
    }
    return loc
  }

  private upload(project: Project, time: number, width: number, height: number): void {
    const gl = this.gl
    const count = Math.min(project.layers.length, MAX_LAYERS)
    for (const key of Object.keys(this.pack) as Pack[]) this.pack[key].fill(0)
    for (let i = 0; i < count; i++) {
      const layer = project.layers[i]
      const o = i * 4
      this.pack.A[o] = TYPE_INDEX[layer.type]
      this.pack.A[o + 1] = layer.enabled ? 1 : 0
      this.pack.A[o + 2] = layer.profile === 'ruling' ? 1 : 0
      this.pack.A[o + 3] = layer.harmonics
      this.pack.B[o] = layer.freq
      this.pack.B[o + 1] = layer.freqB
      this.pack.B[o + 2] = layer.angle
      this.pack.B[o + 3] = layer.phase
      this.pack.C[o] = layer.phaseCycles
      this.pack.C[o + 1] = layer.rotCycles
      this.pack.C[o + 2] = layer.duty
      this.pack.C[o + 3] = layer.opacity
      this.pack.D[o] = layer.centerX
      this.pack.D[o + 1] = layer.centerY
      this.pack.D[o + 2] = layer.orbitR
      this.pack.D[o + 3] = layer.orbitCycles
      this.pack.E[o] = layer.aspect
      this.pack.E[o + 1] = layer.warp
      this.pack.E[o + 2] = layer.warpFreq
      this.pack.E[o + 3] = layer.colorize
      this.pack.F[o] = layer.color[0]
      this.pack.F[o + 1] = layer.color[1]
      this.pack.F[o + 2] = layer.color[2]
    }

    gl.uniform2f(this.location('uResolution'), width, height)
    gl.uniform1f(this.location('uTime'), time)
    gl.uniform1f(this.location('uMotion'), project.motion)
    gl.uniform1i(this.location('uCount'), count)
    gl.uniform1i(this.location('uBlend'), BLEND_INDEX[project.blend])
    gl.uniform1i(this.location('uSamples'), Math.max(1, Math.min(4, Math.round(project.samples))))
    gl.uniform1f(this.location('uExposure'), project.exposure)
    gl.uniform1f(this.location('uGamma'), project.gamma)
    gl.uniform1f(this.location('uContrast'), project.contrast)
    gl.uniform1f(this.location('uSaturation'), project.saturation)
    gl.uniform1f(this.location('uInvert'), project.invert ? 1 : 0)
    gl.uniform1f(this.location('uThreshold'), project.threshold)
    gl.uniform1f(this.location('uVignette'), project.vignette)
    gl.uniform1f(this.location('uIris'), project.iris)
    gl.uniform1f(this.location('uChroma'), project.chroma)
    gl.uniform1f(this.location('uKaleido'), project.kaleido)
    gl.uniform1f(this.location('uTile'), project.tile)
    gl.uniform1f(this.location('uGlobalScale'), project.globalScale)
    gl.uniform1f(this.location('uPulseAmp'), project.pulseAmp)
    gl.uniform1f(this.location('uPulseCycles'), project.pulseCycles)
    gl.uniform1f(this.location('uGlobalRot'), project.globalRot)
    gl.uniform1f(this.location('uGlobalRotCycles'), project.globalRotCycles)
    for (const key of Object.keys(this.pack) as Pack[]) {
      gl.uniform4fv(this.location(`u${key}`), this.pack[key])
    }
  }

  private draw(project: Project, time: number, width: number, height: number): void {
    const gl = this.gl
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    this.upload(project, time, width, height)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  render(project: Project, time: number): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.draw(project, time, this.canvas.width, this.canvas.height)
  }

  /** Bottom-left origin, matching gl_FragCoord. */
  readRaw(project: Project, time: number, width: number, height: number): Uint8Array {
    this.ensureTarget(width, height)
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    this.draw(project, time, width, height)
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return pixels
  }

  private ensureTarget(width: number, height: number): void {
    if (this.fboW === width && this.fboH === height) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Export framebuffer is incomplete (${status})`)
    this.fboW = width
    this.fboH = height
  }
}

export function flipY(src: Uint8Array, width: number, height: number): Uint8Array {
  const dst = new Uint8Array(src.length)
  const row = width * 4
  for (let y = 0; y < height; y++) {
    dst.set(src.subarray((height - 1 - y) * row, (height - y) * row), y * row)
  }
  return dst
}

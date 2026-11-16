/** Thin WebGL2 helpers. No getError/getParameter in hot paths. */

export interface Program {
  prog: WebGLProgram
  vs: WebGLShader
  fs: WebGLShader
  ready: boolean
  failed: boolean
  uniforms: Record<string, WebGLUniformLocation | null>
}

const COMPLETION_STATUS_KHR = 0x91B1

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  parallel: boolean,
): Program | null {
  const prog = gl.createProgram()
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!prog || !vs || !fs)
    return null
  gl.shaderSource(vs, vsSrc)
  gl.shaderSource(fs, fsSrc)
  gl.compileShader(vs)
  gl.compileShader(fs)
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  const p: Program = {
    prog,
    vs,
    fs,
    ready: false,
    failed: false,
    uniforms: {},
  }
  if (!parallel)
    finishProgram(gl, p)
  return p
}

/** Returns true once the program is usable (or failed). Non-blocking with KHR_parallel_shader_compile. */
export function pollProgram(gl: WebGL2RenderingContext, p: Program, parallel: boolean): boolean {
  if (p.ready || p.failed)
    return true
  if (parallel && !gl.getProgramParameter(p.prog, COMPLETION_STATUS_KHR))
    return false
  finishProgram(gl, p)
  return true
}

function finishProgram(gl: WebGL2RenderingContext, p: Program): void {
  if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
    // logs are only read on failure, and only in dev builds; prod still falls back to CSS
    // eslint-disable-next-line node/prefer-global/process
    if (process.env.NODE_ENV !== 'production' && !gl.isContextLost()) {
      console.error(`[liquid-glass] shader link failed:\n${[
        gl.getShaderInfoLog(p.vs),
        gl.getShaderInfoLog(p.fs),
        gl.getProgramInfoLog(p.prog),
      ].filter(Boolean).join('\n')}`)
    }
    p.failed = true
  }
  else {
    p.ready = true
    const n = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p.prog, i)
      if (info)
        p.uniforms[info.name] = gl.getUniformLocation(p.prog, info.name)
    }
  }
  gl.detachShader(p.prog, p.vs)
  gl.detachShader(p.prog, p.fs)
  gl.deleteShader(p.vs)
  gl.deleteShader(p.fs)
}

export function createTexture(gl: WebGL2RenderingContext, w = 0, h = 0): WebGLTexture | null {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (w && h)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  return t
}

export interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

export function createTarget(gl: WebGL2RenderingContext, w: number, h: number): Target | null {
  const tex = createTexture(gl, w, h)
  const fbo = gl.createFramebuffer()
  if (!tex || !fbo)
    return null
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo, w, h }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target): void {
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

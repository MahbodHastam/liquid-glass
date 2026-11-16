/** Public, user-facing glass parameters. All optional; see DEFAULT_PARAMS. */
export interface GlassParams {
  /** Corner radius in CSS px, or 'auto' to read the element's computed border-radius. */
  radius?: number | 'auto'
  /** Backdrop blur radius in CSS px. */
  blur?: number
  /** Edge refraction strength, 0–1. */
  refraction?: number
  /** Magnification of the backdrop, >= 1. */
  zoom?: number
  /** Chromatic aberration at the rim, 0–1. 0 compiles out the extra texture taps. */
  aberration?: number
  /** Static frost grain, 0–1. */
  frost?: number
  /** Specular rim highlight, 0–1. */
  light?: number
  /** Light direction in degrees (0 = from the right, -90 = from the top). */
  lightAngle?: number
  /** Inner edge glow strength, 0–1. */
  edgeGlow?: number
  /** Inner edge glow width, 0–1 (relative to the smaller side). */
  edgeWidth?: number
  /** CSS colour mixed over the glass by its alpha, e.g. 'rgb(255 255 255 / .15)'. */
  tint?: string
  /** Overall opacity, 0–1. */
  opacity?: number
}

export type ResolvedParams = Required<Omit<GlassParams, 'radius'>> & { radius: number | 'auto' }

export const DEFAULT_PARAMS: Readonly<ResolvedParams> = Object.freeze({
  radius: 'auto',
  blur: 12,
  refraction: 0.3,
  zoom: 1.1,
  aberration: 0.2,
  frost: 0.08,
  light: 0.3,
  lightAngle: -55,
  edgeGlow: 0.4,
  edgeWidth: 0.25,
  tint: 'transparent',
  opacity: 1,
})

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
function num(v: unknown, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v)
    ? v
    : fallback
}

/** Merge layers of params (later wins, undefined ignored) and clamp to valid ranges. */
export function resolveParams(...layers: Array<GlassParams | undefined>): ResolvedParams {
  const out: Record<string, unknown> = { ...DEFAULT_PARAMS }
  for (const layer of layers) {
    if (!layer)
      continue
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined && k in DEFAULT_PARAMS)
        out[k] = v
    }
  }
  const d = DEFAULT_PARAMS
  const r = out as ResolvedParams
  return {
    radius: r.radius === 'auto'
      ? 'auto'
      : Math.max(0, num(r.radius, 0)),
    blur: clamp(num(r.blur, d.blur), 0, 64),
    refraction: clamp(num(r.refraction, d.refraction), 0, 1),
    zoom: clamp(num(r.zoom, d.zoom), 1, 3),
    aberration: clamp(num(r.aberration, d.aberration), 0, 1),
    frost: clamp(num(r.frost, d.frost), 0, 1),
    light: clamp(num(r.light, d.light), 0, 1),
    lightAngle: num(r.lightAngle, d.lightAngle),
    edgeGlow: clamp(num(r.edgeGlow, d.edgeGlow), 0, 1),
    edgeWidth: clamp(num(r.edgeWidth, d.edgeWidth), 0, 1),
    tint: typeof r.tint === 'string'
      ? r.tint
      : d.tint,
    opacity: clamp(num(r.opacity, d.opacity), 0, 1),
  }
}

/** Effect modifiers applied on top of params by preferences / quality. */
export interface ParamModifiers {
  /** Multiplier on refraction (reduced motion uses 0.35). */
  refractionScale: number
  /** Force zoom to 1 (reduced motion). */
  flattenZoom: boolean
  /** Drop aberration (low tier). */
  noAberration: boolean
  /** Drop frost (low tier). */
  noFrost: boolean
}

export const NO_MODIFIERS: Readonly<ParamModifiers> = Object.freeze({
  refractionScale: 1,
  flattenZoom: false,
  noAberration: false,
  noFrost: false,
})

/** Values the glass shader consumes, in CSS px / 0–1 units. */
export interface ShaderParams {
  radius: number
  refraction: number
  zoom: number
  aberration: number
  frost: number
  light: number
  lightDir: [number, number]
  edgeGlow: number
  edgeWidth: number
  tint: [number, number, number, number]
  opacity: number
}

export function toShaderParams(
  p: ResolvedParams,
  radiusPx: number,
  tint: [number, number, number, number],
  mods: ParamModifiers = NO_MODIFIERS,
  lightAngleOverride?: number,
): ShaderParams {
  const a = ((lightAngleOverride ?? p.lightAngle) * Math.PI) / 180
  return {
    radius: radiusPx,
    refraction: p.refraction * mods.refractionScale,
    zoom: mods.flattenZoom ? 1 : p.zoom,
    aberration: mods.noAberration ? 0 : p.aberration,
    frost: mods.noFrost ? 0 : p.frost,
    light: p.light,
    // direction the light comes FROM, in y-down CSS space
    lightDir: [
      Math.cos(a),
      Math.sin(a),
    ],
    edgeGlow: p.edgeGlow,
    edgeWidth: p.edgeWidth,
    tint,
    opacity: p.opacity,
  }
}

/**
 * Map a blur radius in backdrop-texture pixels to dual-filter passes + sample offset.
 * Each down/up pass pair roughly doubles the effective radius.
 */
export function blurPlan(radiusTexPx: number, maxPasses = 6): { passes: number, offset: number } {
  if (radiusTexPx < 0.5)
    return { passes: 0, offset: 0 }
  // effective radius of n passes with offset o ≈ o * 2^(n+1) - 1 (empirical, close enough under blur)
  const passes = clamp(Math.ceil(Math.log2((radiusTexPx + 1) / 1.5)) - 1, 1, maxPasses)
  const offset = clamp((radiusTexPx + 1) / 2 ** (passes + 1), 0.5, 3)
  return { passes, offset: Math.round(offset * 4) / 4 }
}

let colorCtx: CanvasRenderingContext2D | null | undefined

/** Parse any CSS colour to premultiplied-free linear-ish sRGB 0–1 RGBA. Browser only. */
export function parseColor(input: string): [number, number, number, number] {
  const s = input.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'none')
    return [0, 0, 0, 0]
  if (colorCtx === undefined) {
    colorCtx = typeof document !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : null
  }
  let norm = s
  if (colorCtx) {
    colorCtx.fillStyle = '#00000000'
    colorCtx.fillStyle = s
    norm = String(colorCtx.fillStyle)
  }
  return parseNormalizedColor(norm)
}

/**
 * Parse what a canvas `fillStyle` round-trip yields: '#rrggbb' or 'rgb[a](r, g, b[, a])'
 * (space syntax also accepted). Anything else → transparent.
 */
export function parseNormalizedColor(s: string): [number, number, number, number] {
  const n = s[0] === '#' && s.length === 7
    ? [1, 3, 5].map(i => Number.parseInt(s.slice(i, i + 2), 16))
    : (s.match(/[\d.]+/g) ?? []).map(Number)
  if (n.length < 3 || n.some(Number.isNaN))
    return [0, 0, 0, 0]
  return [
    n[0]! / 255,
    n[1]! / 255,
    n[2]! / 255,
    n[3] ?? 1,
  ].map(v => clamp(v, 0, 1)) as [number, number, number, number]
}

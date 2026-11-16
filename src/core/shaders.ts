// GLSL ES 3.00 sources, inlined as strings so there is no runtime fetch.
// The visual technique (rounded-box SDF mask, quarter-circle lens profile, rim-weighted
// chromatic aberration, static frost grain) is credited to aliajafari/Liquid-Glass-with-WebGL;
// this implementation is written from scratch.

/** Fullscreen triangle from gl_VertexID, no vertex buffers. v_uv: (0,0) bottom-left. */
export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/** Dual-filter downsample: 5 bilinear taps. u_halfpx = 0.5 / sourceSize * offset. */
export const BLUR_DOWN_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_halfpx;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 h = u_halfpx;
  vec4 s = texture(u_src, v_uv) * 4.0;
  s += texture(u_src, v_uv - h);
  s += texture(u_src, v_uv + h);
  s += texture(u_src, v_uv + vec2(h.x, -h.y));
  s += texture(u_src, v_uv - vec2(h.x, -h.y));
  o = s * 0.125;
}`

/** Dual-filter upsample: 8 bilinear taps. u_halfpx = 0.5 / sourceSize * offset. */
export const BLUR_UP_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_halfpx;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 h = u_halfpx;
  vec4 s = texture(u_src, v_uv + vec2(-h.x * 2.0, 0.0));
  s += texture(u_src, v_uv + vec2(-h.x, h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, h.y * 2.0));
  s += texture(u_src, v_uv + vec2(h.x, h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(h.x * 2.0, 0.0));
  s += texture(u_src, v_uv + vec2(h.x, -h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, -h.y * 2.0));
  s += texture(u_src, v_uv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0;
}`

/**
 * Glass pass. Works in lens-local CSS px (origin top-left, y down).
 * Taps per pixel: 1 (no aberration) or 3 (aberration). Defines: ABERRATION, FROST.
 */
export const GLASS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_tex;      // blurred (or sharp) backdrop, row 0 = top
uniform vec2  u_size;         // lens size, CSS px
uniform vec4  u_uvRect;       // lens rect in backdrop UV (x, y, w, h)
uniform float u_radius;       // corner radius, CSS px
uniform float u_bevel;        // lens bevel band, CSS px
uniform float u_refraction;   // max displacement, CSS px
uniform float u_zoom;
uniform float u_aberration;   // max R/B split, CSS px
uniform float u_frost;
uniform float u_light;
uniform vec2  u_lightDir;     // unit, y down, points toward the light
uniform float u_edgeGlow;
uniform float u_edgeWidth;    // CSS px
uniform vec4  u_tint;         // straight alpha
uniform float u_opacity;
in vec2 v_uv;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 toUv(vec2 px) {
  return u_uvRect.xy + px / u_size * u_uvRect.zw;
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec2 half_ = u_size * 0.5;
  vec2 c = px - half_;
  float r = min(u_radius, min(half_.x, half_.y));

  // rounded-box SDF, CSS px, negative inside
  vec2 q = abs(c) - half_ + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;

  // analytic, smooth outward normal: gradient of a rounded box whose radius covers the bevel
  float k = max(r, u_bevel);
  vec2 g = max(abs(c) - half_ + k, 0.0) * sign(c);
  float glen = length(g);
  vec2 n = glen > 1e-4 ? g / glen : vec2(0.0);

  float aa = max(fwidth(d), 1e-4);
  float mask = clamp(0.5 - d / aa, 0.0, 1.0);

  float rim = 1.0 - clamp(-d / u_bevel, 0.0, 1.0);
  float lens = 1.0 - sqrt(max(1.0 - rim * rim, 0.0)); // quarter-circle: flat centre, steep rim

  vec2 sp = half_ + c / u_zoom + n * lens * u_refraction;

#ifdef ABERRATION
  vec2 ca = n * lens * u_aberration;
  vec3 col = vec3(
    texture(u_tex, toUv(sp - ca)).r,
    texture(u_tex, toUv(sp)).g,
    texture(u_tex, toUv(sp + ca)).b);
#else
  vec3 col = texture(u_tex, toUv(sp)).rgb;
#endif

#ifdef FROST
  col += (hash(floor(px)) - 0.5) * u_frost * 0.16;
#endif

  col = mix(col, u_tint.rgb, u_tint.a);

  // specular rim: strong toward the light, softer on the opposite side
  float band = 1.0 - smoothstep(0.0, 1.5 + u_bevel * 0.35, -d);
  float facing = dot(n, u_lightDir);
  float spec = pow(max(facing, 0.0), 3.0) + 0.35 * pow(max(-facing, 0.0), 3.0);
  col += spec * band * u_light * 1.2;

  // inner edge glow
  col += u_edgeGlow * 0.5 * (1.0 - smoothstep(0.0, u_edgeWidth, -d));

  float a = mask * u_opacity;
  o = vec4(clamp(col, 0.0, 1.0) * a, a);
}`

export interface GlassVariant {
  aberration: boolean
  frost: boolean
}

export function glassFragSource(v: GlassVariant): string {
  return `#version 300 es\n${v.aberration ? '#define ABERRATION\n' : ''}${v.frost ? '#define FROST\n' : ''}${GLASS_FRAG}`
}

export const variantKey = (v: GlassVariant) => (v.aberration ? 1 : 0) | (v.frost ? 2 : 0)

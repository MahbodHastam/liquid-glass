import { describe, expect, it } from 'vitest'
import { blurPlan, DEFAULT_PARAMS, parseNormalizedColor, resolveParams, toShaderParams } from '../src/core/params'

describe('resolveParams', () => {
  it('returns defaults', () => {
    expect(resolveParams()).toEqual(DEFAULT_PARAMS)
  })

  it('layers later over earlier, ignoring undefined', () => {
    const p = resolveParams({ blur: 20, zoom: 1.3 }, { blur: undefined, zoom: 1.5 })
    expect(p.blur).toBe(20)
    expect(p.zoom).toBe(1.5)
  })

  it('clamps out-of-range and non-finite values', () => {
    const p = resolveParams({
      refraction: 4,
      zoom: 0.2,
      blur: -3,
      opacity: Number.NaN,
      radius: -5,
    })
    expect(p.refraction).toBe(1)
    expect(p.zoom).toBe(1)
    expect(p.blur).toBe(0)
    expect(p.opacity).toBe(DEFAULT_PARAMS.opacity)
    expect(p.radius).toBe(0)
  })

  it('ignores unknown keys', () => {
    expect(resolveParams({ foo: 1 } as never)).not.toHaveProperty('foo')
  })
})

describe('toShaderParams', () => {
  const p = resolveParams({
    refraction: 0.5,
    zoom: 1.4,
    aberration: 0.3,
    frost: 0.2,
    lightAngle: 0,
  })

  it('maps the light angle to a unit vector', () => {
    const s = toShaderParams(p, 10, [0, 0, 0, 0])
    expect(s.lightDir[0]).toBeCloseTo(1)
    expect(s.lightDir[1]).toBeCloseTo(0)
  })

  it('applies reduced-motion and tier modifiers', () => {
    const s = toShaderParams(p, 10, [0, 0, 0, 0], {
      refractionScale: 0.35,
      flattenZoom: true,
      noAberration: true,
      noFrost: true,
    })
    expect(s.refraction).toBeCloseTo(0.175)
    expect(s.zoom).toBe(1)
    expect(s.aberration).toBe(0)
    expect(s.frost).toBe(0)
  })
})

describe('blurPlan', () => {
  it('is zero for no blur', () => {
    expect(blurPlan(0)).toEqual({ passes: 0, offset: 0 })
  })

  it('uses more passes for larger radii and stays bounded', () => {
    let prev = 0
    for (const r of [2, 6, 12, 24, 48, 96, 400]) {
      const { passes, offset } = blurPlan(r)
      expect(passes).toBeGreaterThanOrEqual(prev)
      expect(passes).toBeLessThanOrEqual(6)
      expect(offset).toBeGreaterThanOrEqual(0.5)
      expect(offset).toBeLessThanOrEqual(3)
      prev = passes
    }
  })
})

describe('parseNormalizedColor', () => {
  it.each([
    [
      '#fff',
      [1, 1, 1, 1],
    ],
    [
      '#00000000',
      [0, 0, 0, 0],
    ],
    [
      '#ff000080',
      [1, 0, 0, 128 / 255],
    ],
    [
      'rgb(255, 0, 0)',
      [1, 0, 0, 1],
    ],
    [
      'rgba(0, 0, 255, 0.5)',
      [0, 0, 1, 0.5],
    ],
    [
      'rgb(255 255 255 / 0.25)',
      [1, 1, 1, 0.25],
    ],
    [
      'nonsense',
      [0, 0, 0, 0],
    ],
  ])('%s', (input, expected) => {
    const out = parseNormalizedColor(input)
    expected.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 3))
  })
})

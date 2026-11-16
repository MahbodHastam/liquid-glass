import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, motionPolicy, preferences } from '../src/core/preferences'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initial: Record<string, boolean>) {
  const lists = new Map<string, Set<Listener>>()
  const state = { ...initial }
  const mm = vi.fn((q: string) => ({
    get matches() { return !!state[q] },
    media: q,
    addEventListener: (_: string, fn: Listener) => {
      if (!lists.has(q))
        lists.set(q, new Set())
      lists.get(q)!.add(fn)
    },
    removeEventListener: (_: string, fn: Listener) => lists.get(q)?.delete(fn),
  }))
  vi.stubGlobal('matchMedia', mm)
  window.matchMedia = mm as never
  return {
    set(q: string, v: boolean) {
      state[q] = v
      lists.get(q)?.forEach(fn => fn({ matches: v }))
    },
    listenerCount: () => [
      ...lists.values(),
    ].reduce((n, s) => n + s.size, 0),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('preferences store', () => {
  it('reads media queries on first subscribe and tracks runtime changes', () => {
    const mm = mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    const seen: boolean[] = []
    const off = preferences.subscribe(p => seen.push(p.reducedMotion))
    expect(seen).toEqual([true])
    mm.set('(prefers-reduced-motion: reduce)', false)
    expect(seen).toEqual([true, false])
    off()
  })

  it('removes every listener when the last subscriber leaves', () => {
    const mm = mockMatchMedia({})
    const a = preferences.subscribe(() => {})
    const b = preferences.subscribe(() => {})
    expect(mm.listenerCount()).toBe(4)
    a()
    expect(mm.listenerCount()).toBe(4)
    b()
    expect(mm.listenerCount()).toBe(0)
    expect(preferences.listenerCount).toBe(0)
  })
})

// Section 8 decision table
describe('motionPolicy', () => {
  const P = DEFAULT_PREFERENCES
  const reduce = { ...P, reducedMotion: true }

  it('no preference: full effect, pointer allowed', () => {
    expect(motionPolicy(P, 'auto')).toEqual({ fallback: null, dampWarp: false, allowPointer: true })
  })

  it('auto + reduce: damp warping, no pointer, still WebGL', () => {
    expect(motionPolicy(reduce, 'auto')).toEqual({ fallback: null, dampWarp: true, allowPointer: false })
  })

  it('static: always damped, even without the preference', () => {
    expect(motionPolicy(P, 'static')).toEqual({ fallback: null, dampWarp: true, allowPointer: false })
  })

  it('fallback + reduce: CSS fallback', () => {
    expect(motionPolicy(reduce, 'fallback').fallback).toBe('reduced-motion')
    expect(motionPolicy(P, 'fallback').fallback).toBeNull()
  })

  it('ignore: opts out of reduced motion only', () => {
    expect(motionPolicy(reduce, 'ignore')).toEqual({ fallback: null, dampWarp: false, allowPointer: true })
    expect(motionPolicy({ ...reduce, forcedColors: true }, 'ignore').fallback).toBe('forced-colors')
  })

  it('forced colors / more contrast / reduced transparency never draw glass', () => {
    expect(motionPolicy({ ...P, forcedColors: true }, 'auto').fallback).toBe('forced-colors')
    expect(motionPolicy({ ...P, moreContrast: true }, 'auto').fallback).toBe('contrast')
    expect(motionPolicy({ ...P, reducedTransparency: true }, 'auto').fallback).toBe('reduced-transparency')
  })
})

import { describe, expect, it } from 'vitest'
import { AdaptiveQuality, initialTier } from '../src/core/quality'

describe('initialTier', () => {
  it('honours save-data', () => {
    expect(initialTier({ saveData: true, hardwareConcurrency: 16, deviceMemory: 16 })).toBe('low')
  })
  it('starts weak devices low, phones medium, desktops high', () => {
    expect(initialTier({ hardwareConcurrency: 2 })).toBe('low')
    expect(initialTier({ hardwareConcurrency: 8, deviceMemory: 8, coarsePointer: true })).toBe('medium')
    expect(initialTier({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe('high')
  })
})

describe('adaptiveQuality', () => {
  it('steps down after sustained misses', () => {
    const changes: string[] = []
    const q = new AdaptiveQuality('high', 20, 10, t => changes.push(t))
    for (let i = 0; i < 10; i++) q.record(33)
    expect(q.tier).toBe('medium')
    for (let i = 0; i < 10; i++) q.record(33)
    expect(q.tier).toBe('low')
    for (let i = 0; i < 10; i++) q.record(33)
    expect(q.tier).toBe('low')
    expect(changes).toEqual(['medium', 'low'])
  })

  it('does not step down on occasional misses', () => {
    const q = new AdaptiveQuality('high', 20, 10)
    for (let i = 0; i < 100; i++) {
      q.record(i % 4 === 0
        ? 40
        : 16)
    }
    expect(q.tier).toBe('high')
  })

  it('never steps back up', () => {
    const q = new AdaptiveQuality('high', 20, 10)
    for (let i = 0; i < 10; i++) q.record(40)
    for (let i = 0; i < 1000; i++) q.record(8)
    expect(q.tier).toBe('medium')
  })

  it('ignores burst starts and stalls', () => {
    const q = new AdaptiveQuality('high', 20, 10)
    for (let i = 0; i < 50; i++) q.record(0)
    for (let i = 0; i < 50; i++) q.record(1000)
    expect(q.tier).toBe('high')
  })
})

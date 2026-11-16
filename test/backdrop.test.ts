import { describe, expect, it } from 'vitest'
import { computeFit } from '../src/core/backdrop/media'
import { CoalescingQueue } from '../src/core/backdrop/snapshot'

describe('computeFit', () => {
  it('fill uses the element box', () => {
    expect(computeFit(200, 100, 50, 50, 'fill')).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })
  it('cover overflows and centres', () => {
    expect(computeFit(200, 100, 100, 100, 'cover')).toEqual({ x: 0, y: -50, w: 200, h: 200 })
  })
  it('contain letterboxes and centres', () => {
    expect(computeFit(200, 100, 100, 100, 'contain')).toEqual({ x: 50, y: 0, w: 100, h: 100 })
  })
  it('honours object-position', () => {
    expect(computeFit(200, 100, 100, 100, 'cover', '0% 100%')).toEqual({ x: 0, y: -100, w: 200, h: 200 })
    expect(computeFit(200, 100, 100, 100, 'contain', '10px 0px')).toEqual({ x: 10, y: 0, w: 100, h: 100 })
  })
  it('scale-down never upscales', () => {
    expect(computeFit(400, 400, 100, 50, 'scale-down')).toEqual({ x: 150, y: 175, w: 100, h: 50 })
  })
})

describe('coalescingQueue', () => {
  it('runs one job at a time with at most one queued behind it', async () => {
    let running = 0
    let maxRunning = 0
    const resolvers: Array<() => void> = []
    const q = new CoalescingQueue(async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise<void>(r => resolvers.push(r))
      running--
    })
    const p = q.trigger()
    q.trigger()
    q.trigger()
    q.trigger()
    await Promise.resolve()
    resolvers.shift()!()
    await new Promise(r => setTimeout(r))
    resolvers.shift()!()
    await p
    expect(q.runs).toBe(2)
    expect(maxRunning).toBe(1)
  })

  it('runs again for triggers after completion', async () => {
    const q = new CoalescingQueue(async () => {})
    await q.trigger()
    await q.trigger()
    expect(q.runs).toBe(2)
  })
})

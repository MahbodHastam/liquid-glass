import { describe, expect, it } from 'vitest'
import { Scheduler } from '../src/core/scheduler'

function fakeHost() {
  let next = 1
  const queue = new Map<number, FrameRequestCallback>()
  let t = 0
  return {
    host: {
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        const id = next++
        queue.set(id, cb)
        return id
      },
      cancelAnimationFrame: (id: number) => void queue.delete(id),
    },
    pending: () => queue.size,
    flush(dt = 16) {
      t += dt
      const cbs = [
        ...queue.values(),
      ]
      queue.clear()
      cbs.forEach(cb => cb(t))
    },
  }
}

describe('scheduler', () => {
  it('schedules nothing while idle', () => {
    const h = fakeHost()
    const s = new Scheduler(() => false, h.host)
    h.flush()
    h.flush()
    expect(s.rafRequests).toBe(0)
    expect(h.pending()).toBe(0)
  })

  it('coalesces many requests into one frame', () => {
    const h = fakeHost()
    let frames = 0
    const s = new Scheduler(() => {
      frames++
      return false
    }, h.host)
    for (let i = 0; i < 50; i++) s.request()
    expect(s.rafRequests).toBe(1)
    h.flush()
    expect(frames).toBe(1)
    h.flush()
    expect(frames).toBe(1)
    expect(h.pending()).toBe(0)
  })

  it('keeps going only while onFrame asks for it', () => {
    const h = fakeHost()
    let left = 3
    const s = new Scheduler(() => --left > 0, h.host)
    s.request()
    for (let i = 0; i < 10; i++) h.flush()
    expect(s.frames).toBe(3)
    expect(h.pending()).toBe(0)
  })

  it('reports dt only for back-to-back frames', () => {
    const h = fakeHost()
    const dts: number[] = []
    const s = new Scheduler((_n, dt) => {
      dts.push(dt)
      return dts.length < 3
    }, h.host)
    s.request()
    h.flush(16)
    h.flush(16)
    h.flush(16)
    s.request()
    h.flush(500)
    expect(dts).toEqual([0, 16, 16, 0])
  })

  it('pause cancels the pending frame and resume replays it', () => {
    const h = fakeHost()
    let frames = 0
    const s = new Scheduler(() => {
      frames++
      return false
    }, h.host)
    s.request()
    s.pause()
    expect(h.pending()).toBe(0)
    s.request()
    expect(h.pending()).toBe(0)
    s.resume()
    h.flush()
    expect(frames).toBe(1)
  })

  it('dispose drops pending work', () => {
    const h = fakeHost()
    const s = new Scheduler(() => true, h.host)
    s.request()
    s.dispose()
    expect(h.pending()).toBe(0)
  })
})

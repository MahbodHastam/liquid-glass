export interface FrameHost {
  requestAnimationFrame: (cb: FrameRequestCallback) => number
  cancelAnimationFrame: (id: number) => void
}

/**
 * On-demand frame scheduler: at most one rAF in flight, and only while someone asked for a
 * frame. Never loops on its own; `onFrame` returns true to request another frame.
 */
export class Scheduler {
  /** Total rAF requests made. Exposed for tests and the playground overlay. */
  rafRequests = 0
  frames = 0
  private id = 0
  private pending = false
  private paused = false
  private wanted = false
  private last = 0

  constructor(
    private readonly onFrame: (now: number, dt: number) => boolean,
    private readonly host: FrameHost = globalThis as unknown as FrameHost,
  ) {}

  request(): void {
    this.wanted = true
    if (this.pending || this.paused)
      return
    this.pending = true
    this.rafRequests++
    this.id = this.host.requestAnimationFrame(this.tick)
  }

  /** Stop scheduling (background tab). Requests made while paused run on resume. */
  pause(): void {
    this.paused = true
    if (this.pending) {
      this.host.cancelAnimationFrame(this.id)
      this.pending = false
    }
  }

  resume(): void {
    this.paused = false
    this.last = 0
    if (this.wanted)
      this.request()
  }

  dispose(): void {
    this.pause()
    this.wanted = false
  }

  private tick = (now: number): void => {
    this.pending = false
    this.wanted = false
    this.frames++
    // dt only meaningful across back-to-back frames (an animating burst); 0 otherwise
    const dt = this.last && now - this.last < 100
      ? now - this.last
      : 0
    this.last = now
    if (this.onFrame(now, dt))
      this.request()
  }
}

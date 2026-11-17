import type { FallbackReason } from '../preferences'

/** Lens rect expressed in backdrop UV space: [x, y, w, h], (0,0) = top-left of the texture. */
export type UvRect = [number, number, number, number]

/**
 * Where a lens's backdrop pixels come from. The renderer owns the GL texture; a source
 * only supplies a TexImageSource and maps page rects into its UV space.
 */
export interface BackdropSource {
  /** CSS-px size of what the texture covers (used to convert CSS blur radii to texels). */
  readonly cssSize: { width: number, height: number }
  /** Set when the source cannot be used; lenses on it fall back to CSS. */
  readonly failure: FallbackReason | null
  /** Pixels to upload, or null while not ready. */
  getTexImageSource: () => TexImageSource | null
  /** True if the pixels changed since the last call. */
  consumeDirty: () => boolean
  /** Re-read the source's own page rect. Called only inside a scheduled frame (layout read). */
  measure: () => void
  /** Map a lens's page rect (from getBoundingClientRect) into this source's UV space. */
  uvRect: (rect: DOMRectReadOnly) => UvRect | null
  /** Force a re-read of pixels (e.g. app-driven <canvas> changed, or `refresh()`). */
  invalidate: () => void
  /** Notified whenever the source needs a frame (new pixels, layout, failure). */
  subscribe: (fn: () => void) => () => void
  /** Called by the renderer when an upload throws (tainted canvas / CORS). */
  fail: (reason: FallbackReason) => void
  dispose: () => void
}

/** Small helper shared by sources. */
export class Emitter {
  private fns = new Set<() => void>()
  subscribe(fn: () => void): () => void {
    this.fns.add(fn)
    return () => this.fns.delete(fn)
  }

  emit(): void {
    for (const fn of this.fns) fn()
  }

  clear(): void {
    this.fns.clear()
  }
}

/**
 * Dev-only warning. Call sites wrap it in `if (process.env.NODE_ENV !== 'production')`
 * (Vue's esm-bundler convention) so bundlers drop the message strings in production.
 */
export function devWarn(msg: string): void {
  console.warn(`[liquid-glass] ${msg}`)
}

/** Texture edge, in px, that every WebGL2 GPU supports; backdrops are scaled down to fit it. */
export const MAX_TEXTURE_EDGE = 4096

<script setup lang="ts">
import type { QualitySetting, ReducedMotionMode } from '@mahbodhastam/liquid-glass'
import { useLiquidGlassPreferences } from '@mahbodhastam/liquid-glass'
import { peekRenderer } from '@mahbodhastam/liquid-glass/core'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const hero = ref<HTMLImageElement | null>(null)
const params = reactive({
  blur: 6,
  refraction: 0.5,
  zoom: 1.1,
  aberration: 0.3,
  frost: 0.06,
  light: 0.35,
  lightAngle: -55,
  edgeGlow: 0.35,
  edgeWidth: 0.2,
  tint: 'rgb(255 255 255 / 0.06)',
  opacity: 1,
})
const sliders: Array<[keyof typeof params, number, number, number]> = [
  ['blur', 0, 40, 1],
  ['refraction', 0, 1, 0.01],
  ['zoom', 1, 2, 0.01],
  ['aberration', 0, 1, 0.01],
  ['frost', 0, 1, 0.01],
  ['light', 0, 1, 0.01],
  ['lightAngle', -180, 180, 1],
  ['edgeGlow', 0, 1, 0.01],
  ['edgeWidth', 0, 1, 0.01],
  ['opacity', 0, 1, 0.01],
]
const quality = ref<QualitySetting>('auto')
const reducedMotion = ref<ReducedMotionMode>('auto')
const interactive = ref(true)
const disabled = ref(false)
const prefs = useLiquidGlassPreferences()

// draggable lens
const pos = reactive({ x: 120, y: 140 })
let drag: { dx: number, dy: number } | null = null
function down(e: PointerEvent) {
  drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!drag)
    return
  pos.x = e.clientX - drag.dx
  pos.y = e.clientY - drag.dy
}
function up() {
  drag = null
}

const stats = ref('')
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  // setInterval, not rAF, so the overlay never adds frames of its own
  timer = setInterval(() => {
    const r = peekRenderer()
    stats.value = r
      ? `raf ${r.stats.rafRequests} · frames ${r.stats.frames} · draws ${r.stats.draws} · uploads ${r.stats.uploads} · blur passes ${r.stats.blurPasses} · taps/px ${r.stats.tapsPerPixel} · auto tier ${r.autoTier}`
      : 'no renderer'
  }, 250)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <aside class="panel">
    <h1>liquid-glass</h1>
    <label v-for="[key, min, max, step] in sliders" :key="key">
      <span>{{ key }} <b>{{ params[key] }}</b></span>
      <input v-model.number="params[key]" type="range" :min="min" :max="max" :step="step">
    </label>
    <label><span>tint</span><input v-model="params.tint"></label>
    <label><span>quality</span>
      <select v-model="quality"><option v-for="q in ['auto', 'high', 'medium', 'low', 'off']" :key="q">{{ q }}</option></select>
    </label>
    <label><span>reducedMotion</span>
      <select v-model="reducedMotion"><option v-for="q in ['auto', 'static', 'fallback', 'ignore']" :key="q">{{ q }}</option></select>
    </label>
    <label class="row"><input v-model="interactive" type="checkbox"> interactive</label>
    <label class="row"><input v-model="disabled" type="checkbox"> disabled (CSS fallback)</label>
    <p class="prefs">
      OS prefs: reduce-motion {{ prefs.reducedMotion.value }} · reduce-transparency {{ prefs.reducedTransparency.value }} ·
      contrast {{ prefs.moreContrast.value }} · save-data {{ prefs.saveData.value }}
    </p>
    <p class="stats" data-testid="stats">
      {{ stats }}
    </p>
  </aside>

  <main>
    <section class="hero" data-testid="hero">
      <img ref="hero" src="/backdrop.svg" alt="" class="hero-img">
      <LiquidGlass
        v-bind="params"
        :source="hero"
        :quality="quality"
        :reduced-motion="reducedMotion"
        :interactive="interactive"
        :disabled="disabled"
        class="lens drag"
        data-testid="drag-lens"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
      >
        <strong>Drag me</strong>
      </LiquidGlass>
      <LiquidGlass v-bind="params" :source="hero" :quality="quality" :reduced-motion="reducedMotion" :disabled="disabled" class="lens card" :radius="28">
        <h2>Content stays real DOM</h2>
        <p>Selectable, focusable, accessible. <a href="#snap">Jump to snapshot demo</a></p>
      </LiquidGlass>
      <LiquidGlass v-bind="params" :source="hero" :quality="quality" :reduced-motion="reducedMotion" :disabled="disabled" class="lens pill">
        <button>Button</button>
      </LiquidGlass>
    </section>

    <LiquidGlassBackdrop id="snap" class="article">
      <LiquidGlass v-bind="params" :quality="quality" :reduced-motion="reducedMotion" :disabled="disabled" class="nav" data-testid="nav">
        <span>Sticky glass navbar over arbitrary DOM (snapshot source)</span>
      </LiquidGlass>
      <div v-for="i in 8" :key="i" class="block" :style="{ '--h': `${(i * 47) % 360}` }">
        <h3>Section {{ i }}</h3>
        <p>
          The navbar above refracts this page content. The DOM was rasterised once; scrolling only
          moves the lens inside the cached texture, so it costs a uniform update and one draw.
        </p>
      </div>
    </LiquidGlassBackdrop>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #0b1020; color: #f8fafc; }
.panel { position: fixed; z-index: 10; right: 12px; top: 12px; width: 280px; max-height: calc(100vh - 24px); overflow: auto; padding: 12px; border-radius: 12px; background: #111827ee; font-size: 12px; }
.panel h1 { font-size: 14px; margin: 0 0 8px; }
.panel label { display: grid; gap: 2px; margin: 6px 0; }
.panel label.row { display: flex; align-items: center; gap: 6px; }
.panel input, .panel select { width: 100%; }
.panel .row input { width: auto; }
.stats, .prefs { font-family: ui-monospace, monospace; font-size: 11px; opacity: .8; }
.hero { position: relative; height: 100vh; min-height: 560px; overflow: hidden; }
.hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lens { position: absolute; color: #fff; }
.drag { width: 260px; height: 160px; border-radius: 40px; display: grid; place-items: center; cursor: grab; touch-action: none; user-select: none; }
.card { left: 8%; bottom: 10%; width: min(420px, 80vw); padding: 24px; }
.card h2 { margin: 0 0 6px; }
.card a { color: #fff; }
.pill { left: 50%; top: 60%; width: 180px; height: 64px; border-radius: 999px; display: grid; place-items: center; }
.pill button { all: unset; font-weight: 600; cursor: pointer; }
.article { position: relative; padding: 0 0 80px; background: #f8fafc; color: #0f172a; }
.nav { position: sticky; top: 12px; z-index: 5; margin: 0 auto; width: min(720px, calc(100% - 32px)); height: 64px; border-radius: 20px; display: flex; align-items: center; padding: 0 20px; font-weight: 600; color: #0f172a; }
.block { max-width: 720px; margin: 48px auto; padding: 32px; border-radius: 16px; background: hsl(var(--h) 85% 60%); color: #0b1020; }
.block h3 { font-size: 40px; margin: 0; }
@media (max-width: 700px) { .panel { position: static; width: auto; max-height: none; margin: 12px; } }
</style>

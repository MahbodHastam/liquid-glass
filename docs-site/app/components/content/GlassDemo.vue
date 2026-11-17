<script setup lang="ts">
const props = withDefaults(defineProps<{
  blur?: number
  refraction?: number
  zoom?: number
  aberration?: number
  frost?: number
  light?: number
  tint?: string
}>(), {
  blur: 0,
  refraction: 1,
  zoom: 1.1,
  aberration: 0.5,
  frost: 0.08,
  light: 0.2,
  tint: 'transparent',
  maxDpr: 1.5,
})

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const lens = ref<{ $el?: HTMLElement, refresh?: () => Promise<void> } | null>(null)
const lensEl = computed(() => lens.value?.$el ?? null)
const source = shallowRef<HTMLCanvasElement | null>(null)

const pos = reactive({ x: 0, y: 0 })
const dragging = ref(false)

const HUES = [350, 25, 48, 140, 190, 225, 270, 310]

function paint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const stripe = 48
  for (let x = 0, i = 0; x < w; x += stripe, i++) {
    ctx.fillStyle = `hsl(${HUES[i % HUES.length]} 85% 58%)`
    ctx.fillRect(x, 0, stripe, h)
  }

  ctx.strokeStyle = 'rgb(15 23 42 / 0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let y = 24; y < h; y += 24) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
  }
  ctx.stroke()

  ctx.fillStyle = 'rgb(255 255 255 / 0.95)'
  for (let y = 24; y < h; y += 96) {
    for (let x = (y / 96) % 2
      ? stripe
      : 0; x < w; x += stripe * 2) {
      ctx.beginPath()
      ctx.arc(x + stripe / 2, y + 48, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.fillStyle = 'rgb(15 23 42 / 0.9)'
  ctx.font = '800 72px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('liquid glass', w / 2, h - 56)
}

let ro: ResizeObserver | undefined

onMounted(() => {
  const el = canvas.value
  const box = root.value
  const ctx = el?.getContext('2d')
  if (!el || !box || !ctx)
    return

  // match the canvas to its CSS box so lines stay 1:1 sharp instead of being upscaled
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = box.clientWidth
    const h = box.clientHeight
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint(ctx, w, h)
    lens.value?.refresh?.()
  }
  draw()
  source.value = el
  ro = new ResizeObserver(draw)
  ro.observe(box)
})

onBeforeUnmount(() => ro?.disconnect())

let grab = { x: 0, y: 0, px: 0, py: 0 }

function onDown(e: PointerEvent) {
  dragging.value = true
  grab = {
    x: pos.x,
    y: pos.y,
    px: e.clientX,
    py: e.clientY,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onMove(e: PointerEvent) {
  if (!dragging.value || !root.value || !lensEl.value)
    return
  const maxX = (root.value.clientWidth - lensEl.value.offsetWidth) / 2
  const maxY = (root.value.clientHeight - lensEl.value.offsetHeight) / 2
  pos.x = Math.max(-maxX, Math.min(maxX, grab.x + e.clientX - grab.px))
  pos.y = Math.max(-maxY, Math.min(maxY, grab.y + e.clientY - grab.py))
}

function onUp() {
  dragging.value = false
}
</script>

<template>
  <div ref="root" class="glass-demo">
    <canvas ref="canvas" class="glass-demo__bg" aria-hidden="true" />
    <LiquidGlass
      ref="lens"
      :source="source"
      class="glass-demo__lens"
      :class="{ 'is-dragging': dragging }"
      :style="{ transform: `translate(${pos.x}px, ${pos.y}px)` }"
      :blur="props.blur"
      :refraction="props.refraction"
      :zoom="props.zoom"
      :aberration="props.aberration"
      :frost="props.frost"
      :light="props.light"
      :tint="props.tint"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <slot>Drag me</slot>
    </LiquidGlass>
  </div>
</template>

<style scoped>
.glass-demo {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 100%;
  border-radius: 1rem;
  min-height: 15rem;
  margin-block: 1.5rem;
}
.glass-demo__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.glass-demo__lens {
  position: relative;
  padding: 1.5rem 2.5rem;
  border-radius: 1.5rem;
  color: white;
  font-weight: 600;
  font-size: 1.25rem;
  text-shadow: 0 1px 8px rgb(0 0 0 / 0.35);
  cursor: grab;
  user-select: none;
  touch-action: none;
  background: rgb(255 255 255 / 0.12);
}
.glass-demo__lens.is-dragging {
  cursor: grabbing;
}
</style>

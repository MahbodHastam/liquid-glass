<script setup lang="ts">
// Live demo for the docs. The backdrop is a canvas painted on mount, so the glass has
// something to refract without shipping an image. SSR renders the CSS fallback.
const props = withDefaults(defineProps<{
  blur?: number
  refraction?: number
  zoom?: number
  aberration?: number
  frost?: number
  light?: number
  tint?: string
}>(), {
  blur: 12,
  refraction: 0.4,
  zoom: 1.1,
  aberration: 0.2,
  frost: 0.08,
  light: 0.3,
  tint: 'transparent',
})

const canvas = ref<HTMLCanvasElement | null>(null)
const source = shallowRef<HTMLCanvasElement | null>(null)

onMounted(() => {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx)
    return
  const { width: w, height: h } = el
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#0ea5e9')
  bg.addColorStop(0.5, '#a855f7')
  bg.addColorStop(1, '#f97316')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgb(255 255 255 / 0.9)'
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.arc(((i * 97) % w) + 30, ((i * 53) % h) + 20, 14 + (i % 4) * 8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgb(15 23 42 / 0.85)'
  ctx.font = '700 64px system-ui, sans-serif'
  ctx.fillText('liquid glass', 24, h - 32)
  source.value = el
})
</script>

<template>
  <div class="glass-demo">
    <canvas ref="canvas" width="960" height="420" class="glass-demo__bg" aria-hidden="true" />
    <LiquidGlass
      :source="source"
      class="glass-demo__lens"
      :blur="props.blur"
      :refraction="props.refraction"
      :zoom="props.zoom"
      :aberration="props.aberration"
      :frost="props.frost"
      :light="props.light"
      :tint="props.tint"
      interactive
    >
      <slot>Real DOM content</slot>
    </LiquidGlass>
  </div>
</template>

<style scoped>
.glass-demo {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 1rem;
  min-height: 15rem;
  margin-block: 1.5rem;
}
.glass-demo__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.glass-demo__lens {
  position: relative;
  padding: 1.5rem 2rem;
  border-radius: 1.5rem;
  color: white;
  font-weight: 600;
  /* CSS fallback until (or instead of) WebGL */
  background: rgb(255 255 255 / 0.12);
}
</style>

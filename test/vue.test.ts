// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { peekRenderer } from '../src/core/renderer'
import { createLiquidGlass, LiquidGlass, LiquidGlassBackdrop } from '../src/index'

afterEach(() => vi.restoreAllMocks())

const App = defineComponent(() => () =>
  h(LiquidGlassBackdrop, null, () => [
    h('p', 'page content'),
    h(LiquidGlass, { radius: 24, blur: 10, class: 'card' }, () => h('h2', 'Hello')),
  ]))

describe('sSR', () => {
  it('server-renders the CSS fallback with slot content and no canvas', async () => {
    const html = await renderToString(createSSRApp(App).use(createLiquidGlass()))
    expect(html).toContain('data-lg-lens')
    expect(html).toContain('data-lg-state="fallback"')
    expect(html).toContain('backdrop-filter:blur(10px) saturate(1.4)')
    expect(html).toContain('border-radius:24px')
    expect(html).toContain('<h2>Hello</h2>')
    expect(html).not.toContain('<canvas')
  })

  it('hydrates with no mismatch warnings', async () => {
    const html = await renderToString(createSSRApp(App).use(createLiquidGlass()))
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createSSRApp(App).use(createLiquidGlass({
      capture: () => new Promise(() => {}),
    }))
    app.mount(container)
    await nextTick()
    const mismatch = [
      ...warn.mock.calls,
      ...error.mock.calls,
    ].flat().join(' ')
    expect(mismatch).not.toMatch(/hydration|mismatch/i)
    app.unmount()
    container.remove()
  })
})

describe('client', () => {
  it('falls back without WebGL2 and reports why', async () => {
    const wrapper = mount(LiquidGlass, {
      attachTo: document.body,
      slots: { default: 'x' },
    })
    await nextTick()
    // happy-dom has no WebGL2; with no source the reason is one of these
    const events = wrapper.emitted('fallback')?.flat()
    expect(events?.[0]).toMatch(/no-webgl2|no-source/)
    expect(wrapper.attributes('data-lg-state')).toBe('fallback')
    expect(wrapper.find('canvas[aria-hidden="true"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides only snapshot-consuming lenses from the capture', async () => {
    const img = document.createElement('img')
    const wrapper = mount(
      defineComponent(() => () =>
        h(LiquidGlassBackdrop, null, () => [
          h(LiquidGlass, { class: 'nav' }, () => 'nav'),
          h(LiquidGlass, { class: 'card', source: img }, () => 'card'),
        ])),
      {
        attachTo: document.body,
        global: {
          plugins: [
            createLiquidGlass(),
          ],
        },
      },
    )
    await nextTick()
    // no own source -> renders from the snapshot -> must not be in it (feedback loop)
    expect(wrapper.find('.nav').attributes('data-lg-snap')).toBeDefined()
    // own media source -> ordinary page content -> stays in the snapshot
    expect(wrapper.find('.card').attributes('data-lg-snap')).toBeUndefined()
    expect(wrapper.find('.card').attributes('data-lg-lens')).toBeDefined()
    wrapper.unmount()
    expect(document.querySelector('[data-lg-snap]')).toBeNull()
  })

  it('disabled never creates a renderer or canvas', async () => {
    const wrapper = mount(LiquidGlass, {
      props: { disabled: true },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(peekRenderer()).toBeNull()
    wrapper.unmount()
  })

  it('mount/unmount ×100 leaks no listeners, observers or renderers', async () => {
    const counts = new Map<string, number>()
    const bump = (k: string, d: number) => counts.set(k, (counts.get(k) ?? 0) + d)
    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target)
      const remove = target.removeEventListener.bind(target)
      vi.spyOn(target, 'addEventListener').mockImplementation((t: string, fn: any, o?: any) => {
        bump(t, 1)
        add(t, fn, o)
      })
      vi.spyOn(target, 'removeEventListener').mockImplementation((t: string, fn: any, o?: any) => {
        bump(t, -1)
        remove(t, fn, o)
      })
    }
    let observing = 0
    const RO = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class extends RO {
      override observe(t: Element) {
        observing++
        super.observe(t)
      }

      override unobserve(t: Element) {
        observing--
        super.unobserve(t)
      }

      override disconnect() {
        observing = 0
        super.disconnect()
      }
    })

    const show = ref(true)
    const Host = defineComponent(() => () => (show.value
      ? h(LiquidGlass, { radius: 12 }, () => 'hi')
      : null))
    const wrapper = mount(Host, { attachTo: document.body })
    for (let i = 0; i < 100; i++) {
      show.value = false
      await nextTick()
      show.value = true
      await nextTick()
    }
    show.value = false
    await nextTick()

    for (const [type, n] of counts) expect(n, `listener balance for "${type}"`).toBe(0)
    expect(observing).toBe(0)
    expect(peekRenderer()).toBeNull()
    expect(document.querySelectorAll('canvas').length).toBe(0)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('keepAlive deactivation tears down and activation restores', async () => {
    const which = ref<'a' | 'b'>('a')
    const A = defineComponent({
      name: 'A',
      setup: () => () => h(LiquidGlass, null, () => 'a'),
    })
    const B = defineComponent({
      name: 'B',
      setup: () => () => h('div', 'b'),
    })
    const wrapper = mount(defineComponent(() => () => h(KeepAlive, null, [
      which.value === 'a'
        ? h(A)
        : h(B),
    ])), { attachTo: document.body })
    await nextTick()
    expect(peekRenderer()).not.toBeNull()
    which.value = 'b'
    await nextTick()
    expect(peekRenderer()).toBeNull()
    which.value = 'a'
    await nextTick()
    expect(peekRenderer()).not.toBeNull()
    expect(wrapper.findAll('canvas').length).toBe(1)
    wrapper.unmount()
    expect(peekRenderer()).toBeNull()
  })

  it('restores host inline styles it changed', async () => {
    const wrapper = mount(LiquidGlass, { attachTo: document.body })
    await nextTick()
    const el = wrapper.element as HTMLElement
    expect(el.style.position).toBe('relative')
    expect(el.style.isolation).toBe('isolate')
    wrapper.unmount()
    expect(el.style.position).toBe('')
    expect(el.style.isolation).toBe('')
  })
})

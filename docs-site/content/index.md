---
title: Liquid Glass
description: WebGL2 liquid glass for Vue 3 and Nuxt. Real shader refraction, on-demand rendering, accessible by default.
seo:
  title: Liquid Glass for Vue and Nuxt
---

::u-page-hero
#title
Liquid glass for Vue and Nuxt

#description
A WebGL2 shader that bends, magnifies and tints what's behind it. It does no work while the page is idle, renders safely on the server, and follows your users' accessibility settings.

#links
  :::u-button
  ---
  color: neutral
  size: xl
  to: /docs/getting-started/installation
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  color: neutral
  icon: i-simple-icons-github
  size: xl
  to: https://github.com/MahbodHastam/liquid-glass
  variant: outline
  ---
  GitHub
  :::
::

::u-container
:glass-demo{tint="rgb(255 255 255 / 0.08)"}

  :::card-group
  ::::card
  ---
  icon: i-lucide-sparkles
  title: Drawn by a shader
  ---
  The refraction is computed on the GPU instead of with an SVG filter, so Safari and Firefox look like Chrome.
  ::::

  ::::card
  ---
  icon: i-lucide-gauge
  title: Quiet when idle
  ---
  Frames are drawn only when something changes, and every lens on the page shares one WebGL context. The whole thing is under 12 KiB min+gzip.
  ::::

  ::::card
  ---
  icon: i-lucide-accessibility
  title: Respects user settings
  ---
  Reduced motion, reduced transparency, high contrast, forced colors and Save-Data are handled for you.
  ::::

  ::::card
  ---
  icon: i-lucide-server
  title: Works with SSR
  ---
  The server renders a CSS `backdrop-filter` version. The shader takes over after mount, without hydration warnings.
  ::::
:::
::

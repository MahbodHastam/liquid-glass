// Bundle-size budget: core + Vue entry, minified + gzipped as a consumer's production build
// sees it (vue external, NODE_ENV=production). Usage: node scripts/size.ts
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const BUDGET = 12 * 1024
const entries = ['dist/index.js', 'dist/core.js']

let failed = false
for (const entry of entries) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    external: ['vue', '@zumer/snapdom'],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const code = out.outputFiles[0]!.contents
  const text = new TextDecoder().decode(code)
  const gz = gzipSync(code, { level: 9 }).length
  const ok = gz <= BUDGET
  failed ||= !ok
  console.log(`${ok ? '✔' : '✘'} ${entry}: ${(gz / 1024).toFixed(2)} KiB min+gzip (budget ${BUDGET / 1024} KiB)`)
  if (/snapdom\.toCanvas|from\s*["']@zumer\/snapdom/.test(text)) {
    console.log(`✘ ${entry} pulls in the capture library`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)

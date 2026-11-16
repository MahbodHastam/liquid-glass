/**
 * Build-time GLSL minifier for `/* glsl *\/` tagged template literals: strips comments and
 * collapses whitespace. Preprocessor lines keep their newline (GLSL requires it).
 */
export function minifyGlsl(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .reduce((out, line) => {
      if (line.startsWith('#')) {
        return `${out}${out && !out.endsWith('\n')
          ? '\n'
          : ''}${line}\n`
      }
      return out + line.replace(/\s*([{}()[\];,=+\-*/<>!?:&|])\s*/g, '$1').replace(/\s+/g, ' ')
    }, '')
}

export function glslMinifyPlugin() {
  return {
    name: 'glsl-minify',
    transform(code: string, id: string) {
      if (!id.endsWith('shaders.ts'))
        return null
      return code.replace(/\/\* glsl \*\/ `([^`]*)`/g, (_, body: string) => `\`${minifyGlsl(body)}\``)
    },
  }
}

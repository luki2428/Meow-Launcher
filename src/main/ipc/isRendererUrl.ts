// Routing może zmieniać wyłącznie fragment. Ścieżka, query i origin muszą pozostać zaufane.
export function isRendererUrl(candidate: string, rendererUrl: string): boolean {
  try {
    const actual = new URL(candidate)
    const expected = new URL(rendererUrl)
    actual.hash = ''
    expected.hash = ''
    return actual.href === expected.href
  } catch {
    return false
  }
}

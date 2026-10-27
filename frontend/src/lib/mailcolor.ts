// Shared colour maths for the two message-body transforms (mailbg softens a
// background so the wallpaper shows through, maildark darkens it for a dark
// theme). Both need the same parsing and the same luminance measure, and both
// must agree on what "light" means, so those live here rather than in either
// feature.

/** An 8-bit RGB triple. */
export type Rgb = [number, number, number]

/**
 * Parses the colour forms the sanitizer leaves behind, or null when the value
 * is not a plain colour. Everything else - url(), a gradient, a position list,
 * a system keyword - returns null, which callers read as "leave this alone".
 */
export function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase()
  if (v === 'white') {
    return [255, 255, 255]
  }
  if (v === 'black') {
    return [0, 0, 0]
  }
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const s = m[1]
    return [0, 1, 2].map((i) => parseInt(s[i] + s[i], 16)) as Rgb
  }
  m = v.match(/^#([0-9a-f]{6})$/)
  if (m) {
    const hex = m[1]
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
  }
  m = v.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n)))) as Rgb
    }
  }
  return null
}

/** WCAG relative luminance, the measure "is this light" is judged on. */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/** Formats a triple as the #rrggbb form both a style value and bgcolor accept. */
export function toHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

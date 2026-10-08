// Colour maths for the studio engine: hex <-> OKLCH, WCAG contrast, and palette
// building that guarantees readable text whatever colour the prompt asks for.

export function hexToRgb(hex) {
  const match = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) value = value.split('').map((char) => char + char).join('');
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: Math.sqrt(A * A + B * B), h };
}

export function oklchToRgb({ l, c, h }) {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [r, g, b].map((v) => Math.min(1, Math.max(0, fromLinear(v))));
}

export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklch(rgb) : null;
}

export function luminance(color) {
  const [r, g, b] = oklchToRgb(color).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function css({ l, c, h }, alpha) {
  const base = `${(l * 100).toFixed(1)}% ${Math.max(0, c).toFixed(3)} ${h.toFixed(1)}`;
  return alpha == null ? `oklch(${base})` : `oklch(${base} / ${alpha})`;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Nudge lightness until `fg` reaches `target` contrast against `bg`. */
export function ensureContrast(fg, bg, target = 4.5) {
  let color = { ...fg };
  const darker = luminance(bg) > 0.4;
  for (let i = 0; i < 60 && contrast(color, bg) < target; i += 1) {
    color = { ...color, l: clamp(color.l + (darker ? -0.015 : 0.015), 0.04, 0.98) };
  }
  return color;
}

const WHITE = { l: 0.99, c: 0, h: 0 };
const BLACK = { l: 0.16, c: 0.01, h: 0 };

/**
 * Build a complete light + dark palette from a brand primary (and optional accent).
 * `mode` is the default appearance of the design direction.
 */
export function buildPalette({ primaryHex, accentHex, direction, mode = 'light' }) {
  const seed = hexToOklch(primaryHex) || hexToOklch(direction.defaultPrimary) || { l: 0.5, c: 0.12, h: 220 };
  const accentSeed = hexToOklch(accentHex) || { l: clamp(seed.l + 0.18, 0.6, 0.85), c: clamp(seed.c * 1.1, 0.08, 0.17), h: (seed.h + direction.accentShift) % 360 };
  const tint = direction.tint ?? 0.012;
  const h = seed.h;

  const light = {};
  light.bg = { l: direction.lightBgL ?? 0.985, c: tint, h };
  light.surface = { l: Math.min(1, light.bg.l + 0.012), c: tint * 0.6, h };
  light.surface2 = { l: light.bg.l - 0.035, c: tint * 1.6, h };
  light.ink = { l: 0.2, c: Math.min(0.03, seed.c * 0.25), h };
  light.muted = ensureContrast({ l: 0.47, c: Math.min(0.03, seed.c * 0.25), h }, light.bg, 4.6);
  light.primary = { l: clamp(seed.l, 0.3, 0.62), c: clamp(seed.c, 0.04, 0.2), h };
  light.onPrimary = contrast(WHITE, light.primary) >= 4.5 ? WHITE : BLACK;
  if (contrast(light.onPrimary, light.primary) < 4.5) light.primary = ensureContrast(light.primary, WHITE, 4.6), (light.onPrimary = WHITE);
  light.accent = { l: clamp(accentSeed.l, 0.55, 0.86), c: clamp(accentSeed.c, 0.05, 0.19), h: accentSeed.h };
  light.onAccent = contrast(BLACK, light.accent) >= 4.5 ? BLACK : WHITE;
  light.primaryText = ensureContrast(ensureContrast(light.primary, light.bg, 4.6), light.surface2, 4.6);
  light.accentText = ensureContrast(ensureContrast(light.accent, light.bg, 4.6), light.surface2, 4.6);
  light.deep = { l: 0.22, c: clamp(seed.c * 0.55, 0.02, 0.08), h };
  light.onDeep = { l: 0.97, c: 0.01, h };

  const dark = {};
  dark.bg = { l: direction.darkBgL ?? 0.17, c: clamp(seed.c * 0.25, 0.01, 0.04), h };
  dark.surface = { l: dark.bg.l + 0.045, c: dark.bg.c * 1.1, h };
  dark.surface2 = { l: dark.bg.l + 0.09, c: dark.bg.c * 1.2, h };
  dark.ink = { l: 0.96, c: 0.01, h };
  dark.muted = ensureContrast({ l: 0.74, c: 0.02, h }, dark.bg, 4.6);
  dark.primary = { l: clamp(Math.max(seed.l, 0.68), 0.62, 0.82), c: clamp(seed.c, 0.06, 0.18), h };
  dark.onPrimary = contrast(BLACK, dark.primary) >= 4.5 ? BLACK : WHITE;
  dark.accent = { l: clamp(accentSeed.l, 0.68, 0.88), c: clamp(accentSeed.c, 0.06, 0.18), h: accentSeed.h };
  dark.onAccent = contrast(BLACK, dark.accent) >= 4.5 ? BLACK : WHITE;
  dark.primaryText = ensureContrast(ensureContrast(dark.primary, dark.bg, 4.6), dark.surface2, 4.6);
  dark.accentText = ensureContrast(ensureContrast(dark.accent, dark.bg, 4.6), dark.surface2, 4.6);
  dark.deep = { l: dark.bg.l + 0.06, c: dark.bg.c * 1.4, h };
  dark.onDeep = dark.ink;

  const report = {
    light: { text: contrast(light.ink, light.bg), muted: contrast(light.muted, light.bg), button: contrast(light.onPrimary, light.primary), link: contrast(light.primaryText, light.bg), linkOnTint: contrast(light.primaryText, light.surface2), accentText: contrast(light.accentText, light.bg) },
    dark: { text: contrast(dark.ink, dark.bg), muted: contrast(dark.muted, dark.bg), button: contrast(dark.onPrimary, dark.primary), link: contrast(dark.primaryText, dark.bg), linkOnTint: contrast(dark.primaryText, dark.surface2), accentText: contrast(dark.accentText, dark.bg) }
  };
  const ok = Object.values(report).every((set) => Object.values(set).every((value) => value >= 4.5));
  return { light, dark, defaultMode: mode, report, contrastOk: ok, seedHue: h };
}

export function paletteVars(p) {
  return [
    `--bg:${css(p.bg)}`, `--surface:${css(p.surface)}`, `--surface-2:${css(p.surface2)}`,
    `--ink:${css(p.ink)}`, `--muted:${css(p.muted)}`,
    `--primary:${css(p.primary)}`, `--on-primary:${css(p.onPrimary)}`, `--primary-text:${css(p.primaryText)}`,
    `--accent:${css(p.accent)}`, `--on-accent:${css(p.onAccent)}`, `--accent-text:${css(p.accentText)}`,
    `--deep:${css(p.deep)}`, `--on-deep:${css(p.onDeep)}`,
    `--line:${css(p.ink, 0.12)}`, `--line-strong:${css(p.ink, 0.24)}`,
    `--glow:${css(p.primary, 0.35)}`, `--accent-soft:${css(p.accent, 0.18)}`, `--primary-soft:${css(p.primary, 0.12)}`
  ].join(';');
}

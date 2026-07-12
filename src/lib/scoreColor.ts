// Score colour ramp 1 -> 10: coral -> gold -> lime-gold (locked spec).
// Pure; used to colour individual category scores. The Mashed consensus number
// itself always stays teal — that is a separate brand rule, not this ramp.

type Rgb = readonly [number, number, number]

const CORAL: Rgb = [224, 122, 95] // #e07a5f
const GOLD: Rgb = [231, 178, 78] // #e7b24e
const LIME: Rgb = [201, 209, 78] // #c9d14e

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function mix(from: Rgb, to: Rgb, t: number): string {
  return `rgb(${lerp(from[0], to[0], t)}, ${lerp(from[1], to[1], t)}, ${lerp(from[2], to[2], t)})`
}

/** Map a 1..10 score to a colour on the coral -> gold -> lime ramp. */
export function scoreColor(score: number): string {
  const clamped = Math.max(1, Math.min(10, score))
  const t = (clamped - 1) / 9 // 0..1
  return t <= 0.5 ? mix(CORAL, GOLD, t / 0.5) : mix(GOLD, LIME, (t - 0.5) / 0.5)
}

/**
 * Anchor word for a 1..10 score. Ten-point scales drift toward "7 means shrug";
 * naming the bands keeps the low half of the ramp in play.
 */
export function scoreWord(score: number): string {
  if (score <= 2) return 'brutal'
  if (score <= 4) return 'rough'
  if (score <= 6) return 'fine'
  if (score <= 8) return 'great'
  return 'all-timer'
}

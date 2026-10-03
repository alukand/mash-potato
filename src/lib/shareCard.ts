// The Reveal, drawn as an image you can post.
//
// PRIVACY, and it is the reason this file draws instead of screenshotting:
// a shared card carries the GROUP's number and nothing personal — no member
// names, no per-member scores. DESIGN.md's privacy model says ratings are
// never auto-public and that sharing scores happens through a group/community
// number rather than a profile; your own Mashed is yours to post, your
// friend's 3/10 is not yours to publish. Screenshotting the reveal DOM would
// have put four people's cards on the internet, so the card is composed from
// an explicit input type — anything absent from `RevealCardInput` physically
// cannot leak into the image.

import { formatScore } from './scoring'
import mark from '../assets/brand/mascot.webp'
import popcornSticker from '../assets/stickers/popcorn.webp'
import shoutingSticker from '../assets/stickers/shouting.webp'
import skepticalSticker from '../assets/stickers/skeptical.webp'

export interface RevealCardInput {
  groupName: string
  titleName: string
  titleYear: number | null
  mediaType: 'movie' | 'tv'
  /** TMDB poster path; null falls back to the app's gradient monogram. */
  posterPath: string | null
  mashed: number | null
  /** Widest gap between two members, the one aggregate worth bragging about. */
  spread: number | null
  /** How many people scored it. A count, never who. */
  raters: number
  /** The clash line, e.g. "United on Story. Split over Pacing." */
  headline: string | null
}

// 4:5 portrait: X shows it uncropped in the timeline, and it fills a phone
// feed (and an Instagram post) better than 16:9.
const W = 1080
const H = 1350
const PAD = 72

const BG = '#15121b'
const TEXT = '#f3eee5'
const MUTED = '#9c93ab'
const TEAL = '#51c5be'
const GOLD = '#e7b24e'
const CORAL = '#e07a5f'

const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif'
const MONO = '"Azeret Mono", ui-monospace, monospace'

/**
 * The card's mascot reacts to the night (DESIGN.md: the share card is the one
 * place a sticker sits beside a score): shouting when the group split,
 * skeptical when the Mashed is low, popcorn for everything else.
 */
export type CardSticker = 'shouting' | 'skeptical' | 'popcorn'

export function cardSticker(mashed: number | null, spread: number | null): CardSticker {
  if (spread !== null && spread >= 3) return 'shouting'
  if (mashed !== null && mashed < 5) return 'skeptical'
  return 'popcorn'
}

const STICKER_SRC: Record<CardSticker, string> = {
  popcorn: popcornSticker,
  shouting: shoutingSticker,
  skeptical: skepticalSticker,
}

/** A run of headline text and its colour: the agreed category teal, the split one coral. */
export interface HeadlineRun {
  text: string
  tone: 'text' | 'teal' | 'coral'
}

/**
 * The clash headline as coloured lines, the way the Reveal sets it in the app.
 * "United on Story. Split over Pacing." becomes two lines with the categories
 * in teal and coral; any other headline is one plain run.
 */
export function headlineLines(headline: string): HeadlineRun[][] {
  const m = /^United on (.+)\. Split over (.+)\.$/.exec(headline.trim())
  if (!m) return [[{ text: headline.trim(), tone: 'text' }]]
  return [
    [
      { text: 'United on ', tone: 'text' },
      { text: m[1], tone: 'teal' },
      { text: '.', tone: 'text' },
    ],
    [
      { text: 'Split over ', tone: 'text' },
      { text: m[2], tone: 'coral' },
      { text: '.', tone: 'text' },
    ],
  ]
}

/** How far apart, in words, for the meter under the score. */
export function spreadWord(spread: number): string {
  if (spread < 1) return 'In sync'
  if (spread < 3) return 'Close call'
  return 'Split'
}

/** Load a poster for canvas use; null on any failure, never throws. */
function loadPoster(posterPath: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // image.tmdb.org serves Access-Control-Allow-Origin: *, so this keeps the
    // canvas untainted and toBlob() legal. Without it every export would
    // throw a SecurityError at the very last step.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `https://image.tmdb.org/t/p/w500${posterPath}`
  })
}

/**
 * An image that ships with the app (the logo, a sticker). Same-origin, so it
 * keeps the canvas untainted. Null on failure: the card still works.
 */
function loadAsset(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Greedy wrap that also caps the line count, so a long title cannot run off. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines) {
    // ellipsise the last line rather than silently dropping the rest
    let last = lines[maxLines - 1]
    if (words.join(' ') !== lines.join(' ')) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1)
      }
      lines[maxLines - 1] = `${last}…`
    }
  }
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Draw the card. Fonts come from the Google Fonts CDN, so `document.fonts.ready`
 * matters: without it the first draw silently falls back to a system face and
 * the card ships in the wrong typeface. Offline it degrades to that fallback
 * rather than failing, which is the right trade for a share button.
 */
export async function renderRevealCard(input: RevealCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the card')

  await document.fonts.ready.catch(() => undefined)
  const [poster, logo, sticker] = await Promise.all([
    input.posterPath ? loadPoster(input.posterPath) : Promise.resolve(null),
    loadAsset(mark),
    loadAsset(STICKER_SRC[cardSticker(input.mashed, input.spread)]),
  ])

  // ---- background: the poster, blurred into a wash, fading to the app's ink ----
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  if (poster) {
    // Blur by shrinking then stretching: the canvas `filter` property is not
    // in every WebKit the app runs in, but resampling a 24px image is.
    const tiny = document.createElement('canvas')
    tiny.width = 24
    tiny.height = 36
    tiny.getContext('2d')?.drawImage(poster, 0, 0, 24, 36)
    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(tiny, -60, -90, W + 120, H * 0.9)
    ctx.restore()
  }
  const fade = ctx.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(21, 18, 27, 0.35)')
  fade.addColorStop(0.5, 'rgba(21, 18, 27, 0.82)')
  fade.addColorStop(0.72, BG)
  fade.addColorStop(1, BG)
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(790, 372, 20, 790, 372, 520)
  glow.addColorStop(0, 'rgba(81, 197, 190, 0.22)')
  glow.addColorStop(1, 'rgba(81, 197, 190, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ---- header: what this is, and whose night ----
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `700 24px ${MONO}`
  ctx.letterSpacing = '6px'
  ctx.fillStyle = TEAL
  ctx.fillText('THE REVEAL', PAD, 96)
  ctx.textAlign = 'right'
  ctx.fillStyle = TEXT
  const group = input.groupName.toUpperCase()
  ctx.fillText(group.length > 22 ? `${group.slice(0, 21)}…` : group, W - PAD, 96)
  ctx.letterSpacing = '0px'

  // ---- the poster, tipped like a card on a table ----
  const pw = 380
  const ph = 570
  const px = PAD
  const py = 150
  ctx.save()
  ctx.translate(px + pw / 2, py + ph / 2)
  ctx.rotate((-3 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 28
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 26)
  ctx.fillStyle = '#271f31'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.clip()
  if (poster) {
    ctx.drawImage(poster, -pw / 2, -ph / 2, pw, ph)
  } else {
    const grad = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2)
    grad.addColorStop(0, GOLD)
    grad.addColorStop(1, CORAL)
    ctx.fillStyle = grad
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph)
    ctx.fillStyle = BG
    ctx.font = `700 160px ${DISPLAY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(input.titleName.charAt(0).toUpperCase(), 0, 0)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  // ---- the Mashed number in its ring. Always teal (locked identity). ----
  const cx = 790
  const cy = 372
  const r = 178
  ctx.lineCap = 'round'
  ctx.lineWidth = 24
  ctx.strokeStyle = 'rgba(243, 238, 229, 0.08)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  if (input.mashed !== null) {
    const share = Math.max(0.02, Math.min(1, input.mashed / 10))
    ctx.save()
    ctx.shadowColor = 'rgba(81, 197, 190, 0.75)'
    ctx.shadowBlur = 36
    ctx.strokeStyle = TEAL
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = TEAL
  ctx.font = `700 ${input.mashed === null ? 64 : 150}px ${DISPLAY}`
  ctx.fillText(input.mashed === null ? 'No score' : formatScore(input.mashed), cx, cy + 50)
  ctx.font = `700 22px ${MONO}`
  ctx.letterSpacing = '8px'
  ctx.fillStyle = MUTED
  ctx.fillText('MASHED', cx + 4, cy + 100)
  ctx.letterSpacing = '0px'

  // ---- the mascot, reacting to the night from beside the ring ----
  // Sized and placed to clear both the ring above and a two-line title below.
  if (sticker) {
    const sh = 220
    const sw = Math.round((sh * sticker.naturalWidth) / sticker.naturalHeight)
    ctx.save()
    ctx.translate(W - 56 - sw / 2, 642)
    ctx.rotate((7 * Math.PI) / 180)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 14
    ctx.drawImage(sticker, -sw / 2, -sh / 2, sw, sh)
    ctx.restore()
  }

  // ---- title ----
  let y = 852
  ctx.textAlign = 'left'
  ctx.fillStyle = TEXT
  ctx.font = `700 66px ${DISPLAY}`
  const titleLines = wrap(ctx, input.titleName, W - PAD * 2, 2)
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y)
    y += 72
  }
  ctx.fillStyle = MUTED
  ctx.font = `400 26px ${MONO}`
  ctx.letterSpacing = '3px'
  const meta = [input.mediaType === 'movie' ? 'FILM' : 'TV', input.titleYear ?? '', `${input.raters} SCORED BLIND`]
    .filter(Boolean)
    .join(', ')
  ctx.fillText(meta, PAD, y - 22)
  ctx.letterSpacing = '0px'
  y += 58

  // ---- the headline: the disagreement, which is the whole point ----
  if (input.headline) {
    for (const runs of headlineLines(input.headline)) {
      // shrink a long line to fit rather than wrapping it mid-category
      let size = 50
      const width = () => runs.reduce((sum, run) => sum + ctx.measureText(run.text).width, 0)
      ctx.font = `600 ${size}px ${DISPLAY}`
      while (width() > W - PAD * 2 && size > 30) {
        size -= 2
        ctx.font = `600 ${size}px ${DISPLAY}`
      }
      let x = PAD
      for (const run of runs) {
        ctx.fillStyle = run.tone === 'teal' ? TEAL : run.tone === 'coral' ? CORAL : TEXT
        ctx.fillText(run.text, x, y)
        x += ctx.measureText(run.text).width
      }
      y += size + 14
    }
    y += 18
  }

  // ---- how far apart: one aggregate, never whose card was where ----
  if (input.spread !== null && y < H - 190) {
    ctx.font = `700 22px ${MONO}`
    ctx.letterSpacing = '5px'
    ctx.fillStyle = MUTED
    ctx.fillText(`SPREAD ${formatScore(input.spread)}`, PAD, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = input.spread >= 3 ? CORAL : TEAL
    ctx.fillText(spreadWord(input.spread).toUpperCase(), W - PAD, y)
    ctx.textAlign = 'left'
    ctx.letterSpacing = '0px'
    const barY = y + 22
    const barW = W - PAD * 2
    roundRect(ctx, PAD, barY, barW, 14, 7)
    ctx.fillStyle = 'rgba(243, 238, 229, 0.08)'
    ctx.fill()
    const fill = Math.max(14, barW * Math.min(1, input.spread / 9))
    const ramp = ctx.createLinearGradient(PAD, 0, PAD + barW, 0)
    ramp.addColorStop(0, TEAL)
    ramp.addColorStop(0.45, GOLD)
    ramp.addColorStop(1, CORAL)
    roundRect(ctx, PAD, barY, fill, 14, 7)
    ctx.fillStyle = ramp
    ctx.fill()
  }

  // ---- footer: the brand, and where to find it ----
  const footY = H - 64
  let wordX = PAD
  if (logo) {
    const lh = 64
    const lw = Math.round((lh * logo.naturalWidth) / logo.naturalHeight)
    ctx.drawImage(logo, PAD, footY - lh + 14, lw, lh)
    wordX = PAD + lw + 14
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = TEXT
  ctx.font = `700 32px ${DISPLAY}`
  ctx.fillText('Mash Potato', wordX, footY)
  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.font = `400 24px ${MONO}`
  ctx.fillText('mashpotato.app', W - PAD, footY)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the card'))),
      'image/png',
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = String(reader.result)
      // strip the "data:image/png;base64," prefix Filesystem does not want
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the card'))
    reader.readAsDataURL(blob)
  })
}

export type ShareOutcome = 'shared' | 'downloaded' | 'unsupported'

/**
 * Hand the card to the OS.
 *
 * Native goes through Capacitor (write to cache, share the file URI) because
 * `navigator.share` with files is unreliable in WKWebView. The web path tries
 * the Web Share API and falls back to a download, so the button still does
 * something honest in a desktop browser.
 */
export async function shareRevealCard(blob: Blob, fileName: string): Promise<ShareOutcome> {
  const { Capacitor } = await import('@capacitor/core')

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const written = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    })
    await Share.share({ files: [written.uri] })
    return 'shared'
  }

  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return 'shared'
  }

  downloadRevealCard(blob, fileName)
  return 'downloaded'
}

/** Save the card as a file (the web's "save image"; native saves from the share sheet). */
export function downloadRevealCard(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // Revoking synchronously can beat the download on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * How this device can hand the card on: natively (the iOS/Android share sheet,
 * whose Save Image puts it in Photos), through the Web Share API, or only as a
 * download.
 */
export async function cardShareMode(): Promise<'native' | 'webShare' | 'download'> {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) return 'native'
  const probe = new File([new Blob()], 'card.png', { type: 'image/png' })
  return navigator.canShare?.({ files: [probe] }) ? 'webShare' : 'download'
}

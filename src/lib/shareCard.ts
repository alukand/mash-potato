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

import { scoreColor } from './scoreColor'
import { formatScore } from './scoring'

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

const W = 1080
const H = 1350

const BG = '#15121b'
const TEXT = '#f3eee5'
const MUTED = '#9c93ab'
const TEAL = '#51c5be'
const LINE = '#352b42'

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
  const poster = input.posterPath ? await loadPoster(input.posterPath) : null

  // ---- background: the app's wash, so the card reads as this product ----
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.22, 40, W * 0.5, H * 0.22, W * 0.95)
  wash.addColorStop(0, 'rgba(81, 197, 190, 0.14)')
  wash.addColorStop(0.55, 'rgba(231, 178, 78, 0.06)')
  wash.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  // ---- group name ----
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = '700 26px "Azeret Mono", ui-monospace, monospace'
  const groupLabel = input.groupName.toUpperCase()
  ctx.letterSpacing = '6px'
  ctx.fillText(groupLabel.length > 34 ? `${groupLabel.slice(0, 33)}…` : groupLabel, W / 2, 96)
  ctx.letterSpacing = '0px'

  // ---- poster ----
  const pw = 320
  const ph = 480
  const px = (W - pw) / 2
  const py = 150
  ctx.save()
  roundRect(ctx, px, py, pw, ph, 28)
  ctx.clip()
  if (poster) {
    ctx.drawImage(poster, px, py, pw, ph)
  } else {
    const grad = ctx.createLinearGradient(px, py, px + pw, py + ph)
    grad.addColorStop(0, '#E7B24E')
    grad.addColorStop(1, '#E07A5F')
    ctx.fillStyle = grad
    ctx.fillRect(px, py, pw, ph)
    ctx.fillStyle = BG
    ctx.font = '700 150px "Bricolage Grotesque", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(input.titleName.charAt(0).toUpperCase(), W / 2, py + ph / 2)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(53, 43, 66, 0.9)'
  ctx.lineWidth = 2
  roundRect(ctx, px, py, pw, ph, 28)
  ctx.stroke()

  // ---- title ----
  ctx.fillStyle = TEXT
  ctx.font = '600 62px "Bricolage Grotesque", system-ui, sans-serif'
  const titleLines = wrap(ctx, input.titleName, W - 140, 2)
  let y = py + ph + 92
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y)
    y += 70
  }

  ctx.fillStyle = MUTED
  ctx.font = '400 28px "Azeret Mono", ui-monospace, monospace'
  const meta = [input.mediaType === 'movie' ? 'FILM' : 'TV', input.titleYear ?? '']
    .filter(Boolean)
    .join(' · ')
  ctx.fillText(meta, W / 2, y + 2)
  y += 78

  // ---- the number. Always teal, always labelled Mashed (locked identity). ----
  if (input.mashed !== null) {
    ctx.fillStyle = TEAL
    ctx.font = '700 168px "Bricolage Grotesque", system-ui, sans-serif'
    ctx.fillText(formatScore(input.mashed), W / 2, y + 130)
    ctx.fillStyle = MUTED
    ctx.font = '700 24px "Azeret Mono", ui-monospace, monospace'
    ctx.letterSpacing = '8px'
    ctx.fillText('MASHED', W / 2, y + 178)
    ctx.letterSpacing = '0px'
    y += 232
  }

  // ---- the headline: the disagreement, which is the whole point ----
  if (input.headline) {
    ctx.fillStyle = TEXT
    ctx.font = '500 34px "Hanken Grotesk", system-ui, sans-serif'
    for (const line of wrap(ctx, input.headline, W - 160, 2)) {
      ctx.fillText(line, W / 2, y)
      y += 46
    }
  }

  // ---- footer: aggregates only. A count of people, never their names. ----
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(70, H - 118)
  ctx.lineTo(W - 70, H - 118)
  ctx.stroke()

  ctx.font = '400 26px "Azeret Mono", ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = MUTED
  const foot = [`${input.raters} SCORED`]
  if (input.spread !== null) foot.push(`SPREAD ${formatScore(input.spread)}`)
  ctx.fillText(foot.join('   ·   '), 70, H - 66)

  ctx.textAlign = 'right'
  ctx.fillStyle = input.mashed !== null ? scoreColor(input.mashed) : TEAL
  ctx.font = '700 30px "Bricolage Grotesque", system-ui, sans-serif'
  ctx.fillText('Mash Potato', W - 70, H - 64)

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

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // Revoking synchronously can beat the download on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

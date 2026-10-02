// Every raster brand asset, generated from the two source drawings in brand/:
//
//   brand/mascot-face.webp  the mascot's face: the app's HOME-SCREEN ICON and
//                           nothing else (iOS, Android, and the icons the web
//                           app and the website get when saved to a home screen)
//   brand/mascot.webp       the whole mascot, a sticker on cream paper: the LOGO
//                           everywhere else, from favicons to the launch screen
//   brand/mascot-stickers.webp
//                           fifteen poses on a transparent sheet, cut into the
//                           app's stickers (src/assets/stickers/)
//
// Run it after changing any drawing, then commit what it writes:
//
//   npm i --no-save sharp
//   node scripts/brand-assets.mjs
//
// sharp is deliberately not a dependency: this runs when the art changes,
// not on every install or build. web/og.png is not written here, because it
// is laid out in HTML (web/og.html has the command).

import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('This script needs sharp. Install it without saving: npm i --no-save sharp')
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const at = (...parts) => path.join(ROOT, ...parts)
const FACE = at('brand', 'mascot-face.webp')
const BODY = at('brand', 'mascot.webp')
const SHEET = at('brand', 'mascot-stickers.webp')

const BG = '#15121b' // --color-bg, the app's background

let written = 0
async function save(rel, buffer) {
  const file = at(...rel.split('/'))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buffer)
  written += 1
}

// ---- the face -------------------------------------------------------------------

// The source has no alpha channel, so plain resizes stay opaque (what iOS
// requires of an app icon). Don't call removeAlpha() here: sharp applies it at
// output, after any mask, and the tiles' transparent corners turn black.
const face = (size) => sharp(FACE).resize(size, size, { kernel: 'lanczos3' })

/** The face as a tile with rounded corners (the shape of an app icon). */
async function faceTile(size, radius = 0.225) {
  const r = Math.round(size * radius)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  )
  return face(size).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

/**
 * The face shrunk to `fraction` of a square canvas, the margin filled by
 * repeating its own edge pixels so the paper never shows a seam. For icon
 * masks that crop (Android adaptive and round icons, web "maskable"): the
 * brow tips sit near the corners and would otherwise be clipped.
 */
async function facePadded(size, fraction) {
  const inner = Math.round(size * fraction)
  const before = Math.floor((size - inner) / 2)
  const after = size - inner - before
  const buf = await face(inner)
    .extend({ top: before, bottom: after, left: before, right: after, extendWith: 'copy' })
    .png()
    .toBuffer()
  return buf
}

async function faceCircle(size, fraction) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  )
  return sharp(await facePadded(size, fraction))
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

/** The average colour of the drawing's outer edge, for flat fills beside it. */
async function faceEdgeColor() {
  const { data, info } = await sharp(FACE).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < w; i++) {
    for (const [x, y] of [[i, 0], [i, h - 1], [0, Math.min(i, h - 1)], [w - 1, Math.min(i, h - 1)]]) {
      const p = (y * w + x) * 3
      r += data[p]; g += data[p + 1]; b += data[p + 2]; n += 1
    }
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()
}

// ---- the mascot, cut out of its paper ---------------------------------------------
//
// The drawing is a sticker: a white border around the character, on cream
// paper. The paper and the border differ mostly in blue (the paper is warm,
// ~252,249,240; the border is ~255,255,255), so paper is any bright pixel whose
// blue lags its red. Paper connected to the edge, and any pocket of it big
// enough to be background (between an arm and the body), becomes transparent.
// The few pixels where paper meets border keep a soft white edge, with alpha
// taken from how far each one sits between the two colours.

async function cutout() {
  const { data, info } = await sharp(BODY).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const N = W * H
  const isPaper = (i) => {
    const p = i * 3
    return data[p] > 236 && data[p + 1] > 232 && data[p] - data[p + 2] >= 6
  }

  // 1. Paper regions: flood-fill each one, keep those touching the border or
  //    larger than a stray speck.
  const bg = new Uint8Array(N)
  const seen = new Uint8Array(N)
  const stack = new Int32Array(N)
  for (let start = 0; start < N; start++) {
    if (seen[start] || !isPaper(start)) continue
    let top = 0
    let size = 0
    let touchesEdge = false
    const members = []
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const i = stack[--top]
      members.push(i)
      size += 1
      const x = i % W
      const y = (i - x) / W
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j]) continue
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue
        if (!isPaper(j)) continue
        seen[j] = 1
        stack[top++] = j
      }
    }
    if (touchesEdge || size >= 400) for (const i of members) bg[i] = 1
  }

  // 2. Keep only the mascot: the largest connected non-paper region. Anything
  //    else is compression noise in the paper.
  const comp = new Int32Array(N).fill(-1)
  let best = -1
  let bestSize = 0
  let id = 0
  for (let start = 0; start < N; start++) {
    if (bg[start] || comp[start] !== -1) continue
    let top = 0
    let size = 0
    stack[top++] = start
    comp[start] = id
    while (top > 0) {
      const i = stack[--top]
      size += 1
      const x = i % W
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || bg[j] || comp[j] !== -1) continue
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue
        comp[j] = id
        stack[top++] = j
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = id
    }
    id += 1
  }

  // 3. RGBA: opaque mascot, transparent paper, soft white where they meet.
  const out = Buffer.alloc(N * 4)
  const nearPaper = (i) => {
    const x = i % W
    const y = (i - x) / W
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        if (bg[yy * W + xx]) return true
      }
    }
    return false
  }
  let minX = W, minY = H, maxX = 0, maxY = 0
  for (let i = 0; i < N; i++) {
    const p = i * 3
    const q = i * 4
    if (bg[i] || comp[i] !== best) continue
    let alpha = 255
    let [r, g, b] = [data[p], data[p + 1], data[p + 2]]
    if (nearPaper(i) && r > 236 && g > 232) {
      // paper (blue 12 below red) -> 0, white border (blue = red) -> 1
      alpha = Math.round(255 * Math.min(1, Math.max(0, 1 + (b - r) / 12)))
      r = g = b = 255
    }
    out[q] = r
    out[q + 1] = g
    out[q + 2] = b
    out[q + 3] = alpha
    if (alpha > 0) {
      const x = i % W
      const y = (i - x) / W
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const pad = 4
  const left = Math.max(0, minX - pad)
  const top = Math.max(0, minY - pad)
  const width = Math.min(W, maxX + pad + 1) - left
  const height = Math.min(H, maxY + pad + 1) - top
  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width, height })
    .png()
    .toBuffer()
}

const mascotAt = (cut, width) => sharp(cut).resize({ width, kernel: 'lanczos3' })

/** The mascot fitted into a transparent square: browser-tab favicons. */
const mascotSquare = (cut, size) =>
  sharp(cut)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer()

/** The dark launch screen: the app's background, a warm glow, the mascot centred. */
async function splash(cut, width, height, mascotWidth) {
  const glowR = Math.round(Math.max(width, height) * 0.42)
  const glow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs><radialGradient id="g" cx="${width / 2}" cy="${height / 2}" r="${glowR}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#e7b24e" stop-opacity="0.16"/>
        <stop offset="0.55" stop-color="#e7b24e" stop-opacity="0.05"/>
        <stop offset="1" stop-color="#e7b24e" stop-opacity="0"/>
      </radialGradient></defs>
      <circle cx="${width / 2}" cy="${height / 2}" r="${glowR}" fill="url(#g)"/>
    </svg>`,
  )
  const mascot = await mascotAt(cut, mascotWidth).png().toBuffer()
  return sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: glow }, { input: mascot, gravity: 'centre' }])
    .png()
    .toBuffer()
}

// ---- the sticker sheet ---------------------------------------------------------------
//
// Fifteen poses on a transparent sheet, five to a row. Each pose is one
// connected shape; its accents (sparkle lines, hearts, the "?", the "Zzz") are
// separate little shapes. Their bounding boxes overlap the neighbours', so each
// accent goes to the pose whose EDGE is nearest its middle, and each sticker is
// cut from its own pixels rather than a rectangle, so no neighbour bleeds in.
// A white die-cut rim lets the dark-outlined art read on the dark app, the way
// the logo mascot's own white border does.

// Row-major, as drawn. Renaming one renames its file and the <Sticker> name.
const STICKER_NAMES = [
  'shouting', 'cool', 'cheering', 'skeptical', 'grumpy',
  'heart-eyes', 'popcorn', 'wink', 'crying', 'pizza',
  'running', 'confused', 'rock-on', 'sleeping', 'trophy',
]

async function stickers() {
  const { data, info } = await sharp(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const N = W * H
  const visible = (i) => data[i * 4 + 3] > 16

  // 1. connected shapes (8-connectivity)
  const label = new Int32Array(N).fill(-1)
  const stack = new Int32Array(N)
  const shapes = []
  for (let start = 0; start < N; start++) {
    if (label[start] !== -1 || !visible(start)) continue
    const id = shapes.length
    const pixels = []
    let top = 0
    stack[top++] = start
    label[start] = id
    while (top > 0) {
      const i = stack[--top]
      pixels.push(i)
      const x = i % W
      const y = (i - x) / W
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if ((dx === 0 && dy === 0) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (label[j] === -1 && visible(j)) {
            label[j] = id
            stack[top++] = j
          }
        }
      }
    }
    let x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0, sy = 0
    for (const i of pixels) {
      const x = i % W
      const y = (i - x) / W
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      sx += x; sy += y
    }
    shapes.push({ id, pixels, x0, y0, x1, y1, cx: sx / pixels.length, cy: sy / pixels.length })
  }

  // 2. the poses, and every accent to the pose whose edge is nearest it
  const poses = shapes.filter((c) => c.pixels.length > 4000)
  if (poses.length !== STICKER_NAMES.length) {
    throw new Error(`expected ${STICKER_NAMES.length} poses on the sticker sheet, found ${poses.length}`)
  }
  for (const p of poses) {
    p.edge = p.pixels.filter((i) => {
      const x = i % W
      return (x > 0 && label[i - 1] !== p.id) || (x < W - 1 && label[i + 1] !== p.id)
        || (i >= W && label[i - W] !== p.id) || (i < N - W && label[i + W] !== p.id)
    })
    p.parts = [p]
  }
  for (const c of shapes) {
    if (c.pixels.length > 4000) continue
    let best = poses[0]
    let bestD = Infinity
    for (const p of poses) {
      for (const j of p.edge) {
        const x = j % W
        const d = (x - c.cx) ** 2 + ((j - x) / W - c.cy) ** 2
        if (d < bestD) { bestD = d; best = p }
      }
    }
    best.parts.push(c)
  }

  // 3. cut each pose with its accents; add the white rim
  const rowOf = (p) => Math.floor(((p.y0 + p.y1) / 2) / (H / 3))
  poses.sort((a, b) => rowOf(a) - rowOf(b) || a.x0 - b.x0)
  const out = []
  for (const [k, pose] of poses.entries()) {
    const pad = 16
    const x0 = Math.min(...pose.parts.map((c) => c.x0)) - pad
    const y0 = Math.min(...pose.parts.map((c) => c.y0)) - pad
    const w = Math.max(...pose.parts.map((c) => c.x1)) + pad - x0 + 1
    const h = Math.max(...pose.parts.map((c) => c.y1)) + pad - y0 + 1
    const buf = Buffer.alloc(w * h * 4)
    for (const c of pose.parts) {
      for (const i of c.pixels) {
        const x = i % W
        const o = (((i - x) / W - y0) * w + (x - x0)) * 4
        buf[o] = data[i * 4]; buf[o + 1] = data[i * 4 + 1]; buf[o + 2] = data[i * 4 + 2]; buf[o + 3] = data[i * 4 + 3]
      }
    }
    const art = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
    // Grow the solid shape ~6px, rounded (faint ground shadows don't get a rim).
    // One operation per pass: sharp applies each operation once, in its own
    // fixed order, so a second blur() or threshold() in one chain REPLACES the
    // first instead of following it.
    const solid = await sharp(art).extractChannel(3).threshold(128).toBuffer()
    const spread = await sharp(solid).blur(3.5).toBuffer()
    const grown = await sharp(spread).threshold(10).toBuffer()
    const rim = await sharp(grown).blur(0.8).toBuffer()
    const white = await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
      .joinChannel(rim)
      .png()
      .toBuffer()
    out.push({ name: STICKER_NAMES[k], image: sharp(white).composite([{ input: art }]) })
  }
  return out
}

// ---- write everything -------------------------------------------------------------

const cut = await cutout()
const webp = (img) => img.webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer()

// The app UI (bundled by Vite: src/components/Logo.tsx, Mascot.tsx, and the
// share card).
await save('src/assets/brand/mascot.webp', await webp(mascotAt(cut, 600)))

// iOS: the App Store / home-screen icon (opaque, iOS rounds it) and the
// launch screen (aspect-filled, so the mascot sits well inside the centre).
await save(
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  await face(1024).png().toBuffer(),
)
const iosSplash = await splash(cut, 2732, 2732, 560)
for (const scale of ['1x', '2x', '3x']) {
  for (const variant of ['', '-dark']) {
    await save(`ios/App/App/Assets.xcassets/Splash.imageset/Default@${scale}~universal~anyany${variant}.png`, iosSplash)
  }
}

// Android: legacy, round and adaptive launcher icons, and the launch images.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [density, k] of Object.entries(densities)) {
  const dir = `android/app/src/main/res/mipmap-${density}`
  await save(`${dir}/ic_launcher.png`, await faceTile(Math.round(48 * k)))
  await save(`${dir}/ic_launcher_round.png`, await faceCircle(Math.round(48 * k), 0.78))
  // Adaptive foreground: 108dp, of which launchers show the middle 72dp and
  // guarantee only a 66dp circle. At 60dp the face's brow tips clear it.
  await save(`${dir}/ic_launcher_foreground.png`, await facePadded(Math.round(108 * k), 60 / 108))
}
const edge = await faceEdgeColor()
await save(
  'android/app/src/main/res/values/ic_launcher_background.xml',
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${edge}</color>\n</resources>\n`,
  ),
)
const androidSplash = {
  'drawable/splash.png': [480, 320],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
}
for (const [rel, [w, h]] of Object.entries(androidSplash)) {
  await save(`android/app/src/main/res/${rel}`, await splash(cut, w, h, Math.round(Math.min(w, h) * 0.45)))
}

// The web app (public/): the tab favicon is the logo; the home-screen and
// install icons are the face, like the native app's.
await save('public/favicon-32.png', await mascotSquare(cut, 32))
await save('public/icon-180.png', await face(180).png().toBuffer()) // apple-touch-icon: opaque, iOS rounds it
await save('public/icon-192.png', await faceTile(192))
await save('public/icon-512.png', await faceTile(512))
// "maskable": the platform crops to its own shape inside a 40%-radius safe circle.
await save('public/icon-maskable-512.png', await facePadded(512, 0.72))

// The website (web/, a separate static origin): the same split.
await save('web/favicon-32.png', await mascotSquare(cut, 32))
await save('web/apple-touch-icon.png', await face(180).png().toBuffer())
await save('web/mascot-400.webp', await webp(mascotAt(cut, 400)))
await save('web/mascot-800.webp', await webp(mascotAt(cut, 800)))

// The stickers (src/components/Sticker.tsx bundles them).
for (const { name, image } of await stickers()) {
  await save(`src/assets/stickers/${name}.webp`, await webp(image))
}

console.log(`Wrote ${written} files. Android adaptive background: ${edge}.`)
console.log('Now regenerate web/og.png from web/og.html (the command is in that file).')

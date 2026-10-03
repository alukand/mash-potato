import cheering from '../assets/stickers/cheering.webp'
import confused from '../assets/stickers/confused.webp'
import cool from '../assets/stickers/cool.webp'
import crying from '../assets/stickers/crying.webp'
import grumpy from '../assets/stickers/grumpy.webp'
import heartEyes from '../assets/stickers/heart-eyes.webp'
import pizza from '../assets/stickers/pizza.webp'
import popcorn from '../assets/stickers/popcorn.webp'
import rockOn from '../assets/stickers/rock-on.webp'
import running from '../assets/stickers/running.webp'
import shouting from '../assets/stickers/shouting.webp'
import skeptical from '../assets/stickers/skeptical.webp'
import sleeping from '../assets/stickers/sleeping.webp'
import trophy from '../assets/stickers/trophy.webp'
import wink from '../assets/stickers/wink.webp'

// The mascot's sticker set: fifteen poses, cut from brand/mascot-stickers.webp
// by scripts/brand-assets.mjs. In use today (DESIGN.md "The mascot"):
//
//   popcorn    watching: movie night with your crew, your watchlist
//   shouting   debate: an empty thread waiting for its first take
//   skeptical  doubt: nothing matched, too little to go on, something failed
//
// The rest ship for later. A sticker marks the FEELING of an empty, waiting
// or failed moment: never on scores or anything the group made, never more
// than one per view. Decorative, so screen readers skip it; the words beside
// it say what the moment means. Size it by height (the poses differ in width).
// The share card is the one exception (lib/shareCard.ts, DESIGN.md): outside
// the app, its mascot reacts to the night.

const STICKERS = {
  shouting,
  cool,
  cheering,
  skeptical,
  grumpy,
  'heart-eyes': heartEyes,
  popcorn,
  wink,
  crying,
  pizza,
  running,
  confused,
  'rock-on': rockOn,
  sleeping,
  trophy,
} as const

export type StickerName = keyof typeof STICKERS

export function Sticker({ name, className = '' }: { name: StickerName; className?: string }) {
  return (
    <img
      src={STICKERS[name]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`pointer-events-none w-auto shrink-0 select-none ${className}`}
    />
  )
}

import mascot from '../assets/brand/mascot.webp'

// The Mash Potato mascot, whole: an angry potato, pointing. This is the
// mascot as illustration, for the moments with room for a character (the
// launch splash, the first thing a signed-out visitor sees, the empty Home
// card). <Logo> is the same drawing as the labelled mark.
//
// Decorative, so screen readers skip it: wherever it appears, the words beside
// it carry the meaning. `flip` turns it to point left, at whatever sits to its
// left. The art is a sticker with its own white border, cut out of its paper
// by scripts/brand-assets.mjs, so it reads on the dark background as is.

export function Mascot({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <img
      src={mascot}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`pointer-events-none select-none ${flip ? '-scale-x-100' : ''} ${className}`}
    />
  )
}

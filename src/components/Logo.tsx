import mascot from '../assets/brand/mascot.webp'

// The Mash Potato logo: the mascot, whole. The art is about square, so the
// call site's className sets a square box and it fills it. The face alone is
// the app's home-screen icon and appears nowhere inside the app. Generated
// from brand/mascot.webp by scripts/brand-assets.mjs.
//
// <Mascot> is the same drawing as decoration (no label, can be flipped) for
// the bigger moments; this is the labelled mark.

export function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src={mascot}
      alt="Mash Potato logo"
      draggable={false}
      className={`shrink-0 select-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] ${className}`}
    />
  )
}

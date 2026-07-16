/* eslint-disable react/only-export-components -- the catalog data and the
   Avatar component are one unit; HMR granularity is a fine trade here */
import type { ReactNode } from 'react'

// The avatar catalog: twenty ORIGINAL movie-archetype portraits, flat and
// two-tone like the app's poster-night palette. They evoke the classics
// (the vampire, the shark, the little green alien) without depicting any
// copyrighted character — nothing here is from a film, everything here is
// from the movies. Null avatar_key = the classic initial circle.
//
// Drawn on a 64x64 grid; each entry is a solid backdrop + simple shapes.

export interface MovieAvatarDef {
  key: string
  label: string
  bg: string
  art: ReactNode
}

const INK = '#15121b' // matches --color-bg: shapes read as cutouts
const BONE = '#f3eee5' // matches --color-text

export const AVATAR_CATALOG: MovieAvatarDef[] = [
  {
    key: 'vampire',
    label: 'The Vampire',
    bg: '#7a2739',
    art: (
      <>
        {/* widow's peak, pale face, the fangs */}
        <path d="M14 24c0-11 8-15 18-15s18 4 18 15l-4 6H18l-4-6Z" fill={INK} />
        <path d="M18 27c0-8 6-12 14-12s14 4 14 12v9c0 9-6 14-14 14s-14-5-14-14v-9Z" fill={BONE} />
        <path d="M32 13l-5 9h10l-5-9Z" fill={INK} />
        <circle cx="25" cy="33" r="2.6" fill={INK} />
        <circle cx="39" cy="33" r="2.6" fill={INK} />
        <path d="M25 42h14" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M27 42l2 5 2-5M33 42l2 5 2-5" fill={BONE} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      </>
    ),
  },
  {
    key: 'robot',
    label: 'The Robot',
    bg: '#3f5d73',
    art: (
      <>
        <rect x="16" y="18" width="32" height="28" rx="6" fill={BONE} />
        <path d="M32 18v-7M32 11h0" stroke={BONE} strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="9" r="3" fill="#e7b24e" />
        <rect x="22" y="26" width="8" height="8" rx="2" fill={INK} />
        <rect x="34" y="26" width="8" height="8" rx="2" fill={INK} />
        <circle cx="26" cy="30" r="1.6" fill="#51c5be" />
        <circle cx="38" cy="30" r="1.6" fill="#51c5be" />
        <path d="M24 40h16" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3.4 3" />
        <rect x="10" y="26" width="6" height="12" rx="3" fill={BONE} />
        <rect x="48" y="26" width="6" height="12" rx="3" fill={BONE} />
      </>
    ),
  },
  {
    key: 'alien',
    label: 'The Visitor',
    bg: '#3c6b4f',
    art: (
      <>
        <path d="M32 10c11 0 17 8 17 17 0 12-9 25-17 25S15 39 15 27c0-9 6-17 17-17Z" fill="#9fd68a" />
        <ellipse cx="25" cy="29" rx="5.4" ry="7.6" transform="rotate(18 25 29)" fill={INK} />
        <ellipse cx="39" cy="29" rx="5.4" ry="7.6" transform="rotate(-18 39 29)" fill={INK} />
        <path d="M29 45c2 1.4 4 1.4 6 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    key: 'ghost',
    label: 'The Ghost',
    bg: '#4b435c',
    art: (
      <>
        <path d="M32 10c-10 0-16 8-16 18v22l5-4 5 4 6-4 6 4 5-4 5 4V28c0-10-6-18-16-18Z" fill={BONE} />
        <circle cx="26" cy="28" r="3" fill={INK} />
        <circle cx="38" cy="28" r="3" fill={INK} />
        <ellipse cx="32" cy="38" rx="3.4" ry="4.6" fill={INK} />
      </>
    ),
  },
  {
    key: 'zombie',
    label: 'The Undead',
    bg: '#5a6b3b',
    art: (
      <>
        <path d="M18 26c0-9 6-14 14-14s14 5 14 14v10c0 9-6 14-14 14s-14-5-14-14V26Z" fill="#b9c98a" />
        <path d="M18 24c4-3 10-4 14-4s10 1 14 4l-2-8c-3-3-8-4-12-4s-9 1-12 4l-2 8Z" fill={INK} />
        <circle cx="25" cy="31" r="2.6" fill={INK} />
        <path d="M36 31l6-2M36 33l6 2" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path d="M24 42h16" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M29 42v4M35 42v-4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'wizard',
    label: 'The Wizard',
    bg: '#41497f',
    art: (
      <>
        <path d="M32 6 18 30h28L32 6Z" fill="#6b74b8" />
        <circle cx="32" cy="12" r="2" fill="#e7b24e" />
        <circle cx="24" cy="22" r="1.4" fill="#e7b24e" />
        <circle cx="39" cy="24" r="1.4" fill="#e7b24e" />
        <path d="M16 30h32" stroke="#6b74b8" strokeWidth="4" strokeLinecap="round" />
        <path d="M22 34c0-2 4-4 10-4s10 2 10 4v2c0 4-2 6-4 7l-6 15-6-15c-2-1-4-3-4-7v-2Z" fill={BONE} />
        <circle cx="27" cy="35" r="2" fill={INK} />
        <circle cx="37" cy="35" r="2" fill={INK} />
      </>
    ),
  },
  {
    key: 'detective',
    label: 'The Detective',
    bg: '#6b5537',
    art: (
      <>
        <path d="M20 20c0-4 5-8 12-8s12 4 12 8l1 4H19l1-4Z" fill={INK} />
        <path d="M14 26c0-2 8-3 18-3s18 1 18 3-8 3-18 3-18-1-18-3Z" fill={INK} />
        <path d="M20 30c0-2 5-3 12-3s12 1 12 3v7c0 8-5 13-12 13s-12-5-12-13v-7Z" fill={BONE} />
        <rect x="21" y="31" width="9" height="7" rx="2.5" fill={INK} />
        <rect x="34" y="31" width="9" height="7" rx="2.5" fill={INK} />
        <path d="M30 34h4" stroke={INK} strokeWidth="2" />
        <path d="M26 45h12" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'cowboy',
    label: 'The Cowboy',
    bg: '#8a5a2c',
    art: (
      <>
        <path d="M24 16c0-4 3-7 8-7s8 3 8 7l1 6c4 0 9 1 9 3s-8 4-18 4-18-2-18-4 5-3 9-3l1-6Z" fill={INK} />
        <path d="M21 30c0-2 5-3 11-3s11 1 11 3v6c0 8-5 13-11 13s-11-5-11-13v-6Z" fill="#e8c39a" />
        <circle cx="27" cy="33" r="2.2" fill={INK} />
        <circle cx="37" cy="33" r="2.2" fill={INK} />
        <path d="M26 44c4 3 8 3 12 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M18 50c4-3 9-4 14-4s10 1 14 4" stroke="#c0392b" strokeWidth="5" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    key: 'hero',
    label: 'The Hero',
    bg: '#b3452e',
    art: (
      <>
        <circle cx="32" cy="32" r="19" fill="#e8c39a" />
        <path d="M13 30c2-12 9-17 19-17s17 5 19 17l-7 4H20l-7-4Z" fill={INK} />
        <path d="M20 28h10l-2 6h-7l-1-6ZM44 28H34l2 6h7l1-6Z" fill="#f2cd77" />
        <path d="M26 44c4 2.6 8 2.6 12 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M34 8l-5 9h6l-4 8" stroke="#f2cd77" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    key: 'royal',
    label: 'The Royal',
    bg: '#7c3f63',
    art: (
      <>
        <path d="M18 22l4-10 5 6 5-9 5 9 5-6 4 10H18Z" fill="#f2cd77" />
        <circle cx="22" cy="12" r="2" fill="#f2cd77" />
        <circle cx="32" cy="8" r="2" fill="#f2cd77" />
        <circle cx="42" cy="12" r="2" fill="#f2cd77" />
        <path d="M20 26c0-2 5-4 12-4s12 2 12 4v10c0 8-5 13-12 13s-12-5-12-13V26Z" fill={BONE} />
        <circle cx="27" cy="33" r="2.2" fill={INK} />
        <circle cx="37" cy="33" r="2.2" fill={INK} />
        <path d="M27 43c3 2.4 7 2.4 10 0" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    key: 'pirate',
    label: 'The Pirate',
    bg: '#2e4a56',
    art: (
      <>
        <path d="M17 24c1-9 7-14 15-14s14 5 15 14l1 3H16l1-3Z" fill={INK} />
        <path d="M16 27h32M20 20l-6 4M44 20l6 4" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="16" r="2" fill={BONE} />
        <path d="M20 29c0-1 5-2 12-2s12 1 12 2v8c0 8-5 13-12 13s-12-5-12-13v-8Z" fill="#e8c39a" />
        <path d="M22 32h9v6h-7l-2-6ZM20 30l24 3" stroke={INK} strokeWidth="2.4" fill={INK} strokeLinejoin="round" />
        <circle cx="39" cy="34" r="2.4" fill={INK} />
        <path d="M27 45h11" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="46" cy="44" r="2.6" fill="#f2cd77" />
      </>
    ),
  },
  {
    key: 'monster',
    label: 'The Kaiju',
    bg: '#2f5e50',
    art: (
      <>
        <path d="M32 8l4 6 7-3-1 8 8 2-6 6 5 6-9 1 1 9-9-4-9 4 1-9-9-1 5-6-6-6 8-2-1-8 7 3 4-6Z" fill="#6fae74" />
        <circle cx="26" cy="30" r="3" fill={INK} />
        <circle cx="38" cy="30" r="3" fill={INK} />
        <path d="M24 40c2 3 5 4 8 4s6-1 8-4" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M27 40l2 4M32 41v4M37 40l-2 4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'shark',
    label: 'The Shark',
    bg: '#1f3a5f',
    art: (
      <>
        <path d="M10 44c8 0 10-6 22-6s14 6 22 6v10H10V44Z" fill="#2c5382" />
        <path d="M32 12c8 5 12 14 12 24l-12-6-12 6c0-10 4-19 12-24Z" fill={BONE} />
        <path d="M32 30l10 5c-2 6-5 9-10 9s-8-3-10-9l10-5Z" fill={BONE} />
        <path d="M25 40l2.4 4 2.4-4 2.4 4 2.4-4 2.4 4 2.4-4" stroke={INK} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        <circle cx="27" cy="33" r="1.8" fill={INK} />
        <circle cx="37" cy="33" r="1.8" fill={INK} />
      </>
    ),
  },
  {
    key: 'dino',
    label: 'The Dino',
    bg: '#5c5230',
    art: (
      <>
        <path d="M14 20c10-8 26-8 34-2 4 3 4 8 0 10l-14 4v6l-4-2v6l-4-3v7c-6-2-12-8-12-16v-10Z" fill="#a4b060" />
        <circle cx="24" cy="22" r="2.6" fill={INK} />
        <path d="M34 28l3 5 3-6 3 5 3-6" stroke={INK} strokeWidth="2" fill="none" strokeLinejoin="round" />
        <path d="M14 24c-3 1-5 4-4 8" stroke="#a4b060" strokeWidth="4" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    key: 'astronaut',
    label: 'The Astronaut',
    bg: '#41414f',
    art: (
      <>
        <circle cx="32" cy="30" r="19" fill={BONE} />
        <path d="M18 30c0-9 6-14 14-14s14 5 14 14v3c0 3-6 5-14 5s-14-2-14-5v-3Z" fill={INK} />
        <path d="M22 26c2-4 6-6 10-6" stroke="#51c5be" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <rect x="24" y="49" width="16" height="7" rx="3" fill="#e7b24e" />
        <circle cx="53" cy="12" r="2" fill={BONE} />
        <circle cx="10" cy="18" r="1.4" fill={BONE} />
      </>
    ),
  },
  {
    key: 'clown',
    label: 'The Clown',
    bg: '#8a2f2f',
    art: (
      <>
        <path d="M20 26c0-8 5-13 12-13s12 5 12 13v8c0 8-5 14-12 14s-12-6-12-14v-8Z" fill={BONE} />
        <path d="M20 22c-4 0-7 3-7 7s3 6 6 6M44 22c4 0 7 3 7 7s-3 6-6 6" fill="#c0392b" />
        <path d="M32 13c-2-4 1-8 5-7" stroke="#c0392b" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="26" cy="30" r="2.4" fill={INK} />
        <circle cx="38" cy="30" r="2.4" fill={INK} />
        <circle cx="32" cy="37" r="4" fill="#c0392b" />
        <path d="M25 44c4 3.4 10 3.4 14 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  {
    key: 'popcorn',
    label: 'The Popcorn',
    bg: '#a03d33',
    art: (
      <>
        <circle cx="22" cy="16" r="5" fill={BONE} />
        <circle cx="32" cy="12" r="6" fill={BONE} />
        <circle cx="42" cy="16" r="5" fill={BONE} />
        <circle cx="27" cy="19" r="4.4" fill={BONE} />
        <circle cx="37" cy="19" r="4.4" fill={BONE} />
        <path d="M17 22h30l-4 32H21l-4-32Z" fill={BONE} />
        <path d="M23 22l2 32M32 22v32M41 22l-2 32" stroke="#c0392b" strokeWidth="4" />
      </>
    ),
  },
  {
    key: 'threeD',
    label: 'The 3D Glasses',
    bg: '#33565e',
    art: (
      <>
        <rect x="8" y="24" width="48" height="16" rx="5" fill={BONE} />
        <rect x="13" y="28" width="16" height="8" rx="2" fill="#c0392b" />
        <rect x="35" y="28" width="16" height="8" rx="2" fill="#3f7fb5" />
        <path d="M29 32h6" stroke={BONE} strokeWidth="4" />
        <path d="M8 29l-3 10M56 29l3 10" stroke={BONE} strokeWidth="3.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'clapper',
    label: 'The Clapper',
    bg: '#3d3d46',
    art: (
      <>
        <path d="M12 22 48 12l3 9-36 10-3-9Z" fill={INK} />
        <path d="M17 20l5 8M26 18l5 7M35 15l5 8M44 13l5 7" stroke={BONE} strokeWidth="3" />
        <rect x="14" y="30" width="37" height="22" rx="3" fill={INK} />
        <path d="M18 36h29M18 42h29" stroke={BONE} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'reel',
    label: 'The Reel',
    bg: '#5b4a6b',
    art: (
      <>
        <circle cx="30" cy="30" r="20" fill={BONE} />
        <circle cx="30" cy="30" r="5" fill={INK} />
        <circle cx="30" cy="17" r="4" fill={INK} />
        <circle cx="41" cy="24" r="4" fill={INK} />
        <circle cx="41" cy="37" r="4" fill={INK} />
        <circle cx="30" cy="43" r="4" fill={INK} />
        <circle cx="19" cy="37" r="4" fill={INK} />
        <circle cx="19" cy="24" r="4" fill={INK} />
        <path d="M48 42c4 4 6 8 6 12h-8c0-3-1-6-4-8" fill={BONE} />
      </>
    ),
  },
]

const CATALOG_BY_KEY = new Map(AVATAR_CATALOG.map((a) => [a.key, a]))

export function avatarDef(key: string | null | undefined): MovieAvatarDef | null {
  return (key && CATALOG_BY_KEY.get(key)) || null
}

interface AvatarProps {
  avatarKey: string | null | undefined
  displayName: string
  /** Fallback initial-circle color (colorForMember / colorForUser). */
  color: string
  /** Diameter in px. */
  size: number
  className?: string
}

/**
 * The one people-avatar recipe: a picked movie-archetype portrait, else the
 * classic initial on the member's palette color. Always a circle.
 */
export function Avatar({ avatarKey, displayName, color, size, className = '' }: AvatarProps) {
  const def = avatarDef(avatarKey)
  if (def) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size, backgroundColor: def.bg }}
      >
        <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
          {def.art}
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-mono font-bold text-bg ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        backgroundColor: color,
      }}
    >
      {displayName.charAt(0).toUpperCase()}
    </span>
  )
}

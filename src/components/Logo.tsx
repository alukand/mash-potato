// Mash Potato wordmark glyph — a friendly potato with a teal "fresh mash"
// sparkle. Custom SVG (replaces the placeholder emoji).

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="Mash Potato logo"
    >
      <defs>
        <linearGradient
          id="mp-potato"
          x1="11"
          y1="5"
          x2="29"
          y2="37"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F2CD77" />
          <stop offset="1" stopColor="#DFA338" />
        </linearGradient>
      </defs>

      {/* body */}
      <path
        d="M20.5 5.4c7-.9 13.4 3.6 14.6 10.2 1.2 6.7-3 14.1-10.6 15.7-7.5 1.6-15.7-2.4-17-9.9C6.3 14 10.2 6.4 20.5 5.4Z"
        fill="url(#mp-potato)"
      />

      {/* soft highlight */}
      <path
        d="M13.6 12.9c2.3-2.7 5.5-4.1 8.5-3.8-3.1.7-5.9 2.4-7.6 5-1.1 1.7-1.3 3.4-2.2 3.2-.9-.2-.5-2.2 1.3-4.4Z"
        fill="#FCE9B6"
        opacity="0.55"
      />

      {/* eyes */}
      <g fill="#9A6B27" opacity="0.65">
        <ellipse cx="16.4" cy="19.6" rx="1.05" ry="1.4" transform="rotate(-18 16.4 19.6)" />
        <ellipse cx="24.2" cy="17.9" rx="0.95" ry="1.25" transform="rotate(-18 24.2 17.9)" />
        <ellipse cx="21.3" cy="25.6" rx="1" ry="1.3" transform="rotate(-18 21.3 25.6)" />
      </g>

      {/* teal sparkle */}
      <path
        d="M31.2 6.6c.35 1.9 1.15 2.7 3.05 3.05-1.9.35-2.7 1.15-3.05 3.05-.35-1.9-1.15-2.7-3.05-3.05 1.9-.35 2.7-1.15 3.05-3.05Z"
        fill="#51C5BE"
      />
    </svg>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { posterUrl } from '../lib/api'
import type { TmdbResult } from '../lib/api'

interface PosterShelfProps {
  heading: string
  items: TmdbResult[]
  onPick: (item: TmdbResult) => void
}

// Touch keeps its natural swipe; buttons make the same shelf usable with a
// mouse or keyboard. Nothing automatically scrolls away from the reader.
export function PosterShelf({ heading, items, onPick }: PosterShelfProps) {
  const id = useId()
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ previous: false, next: false })
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const update = () => {
      const previous = element.scrollLeft > 4
      const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 4
      setEdges((old) => old.previous === previous && old.next === next ? old : { previous, next })
    }
    update()
    const resize = new ResizeObserver(update)
    resize.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    return () => { resize.disconnect(); element.removeEventListener('scroll', update) }
  }, [items])
  function move(direction: number) {
    const element = strip.current
    if (!element) return
    element.scrollBy({ left: direction * Math.max(116, element.clientWidth * .8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  if (items.length === 0) return null
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-1 flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 id={`${id}-heading`} className="font-display text-[19px] font-semibold leading-tight">{heading}</h2>
        {(edges.previous || edges.next) && <div className="flex shrink-0 gap-1">
          {([-1, 1] as const).map((direction) => <button key={direction} type="button" onClick={() => move(direction)} aria-label={`${direction < 0 ? 'Previous' : 'More'} titles in ${heading}`} aria-controls={id} disabled={direction < 0 ? !edges.previous : !edges.next} className="grid h-11 w-11 place-items-center rounded-full border border-line text-muted transition-colors hover:border-teal/50 hover:text-teal disabled:opacity-25">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={direction < 0 ? 'm14 6-6 6 6 6 6' : 'm10 6 6 6-6 6'} /></svg>
          </button>)}
        </div>}
      </div>
      <div ref={strip} id={id} className="-mx-5 flex snap-x snap-proximity gap-3 overflow-x-auto px-5 pb-3 pt-2 [scroll-padding-inline:20px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <button key={`${item.tmdbId}:${item.name}`} type="button" onClick={() => onPick(item)} className="mp-poster-button w-[104px] shrink-0 snap-start self-start text-left">
            <div className="mp-poster-art relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
              {item.posterPath ? <img src={posterUrl(item.posterPath, 'w342')} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span aria-hidden className="grid h-full w-full place-items-center bg-teal/20 font-display text-2xl font-semibold text-teal">{item.name.charAt(0)}</span>}
            </div>
            <p className="mp-poster-title mt-2 line-clamp-2 text-[12px] font-medium leading-snug">{item.name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted">{item.year ?? 'Year unavailable'}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

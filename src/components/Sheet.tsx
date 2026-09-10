import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

let openSheets = 0
let previousOverflow = ''

/** The browser's modal layer handles focus trapping and background inertness.
 * Portalling also keeps sheets independent of animated screen ancestors. */
export function Sheet({ label, onClose, children, className = '' }: {
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backdropPress = useRef(false)
  const [closing, setClosing] = useState(false)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement
    if (openSheets++ === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    dialog.showModal()
    dialog.focus({ preventScroll: true })
    return () => {
      if (timer.current) clearTimeout(timer.current)
      dialog.close()
      if (--openSheets === 0) document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  function dismiss() {
    if (timer.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { closeRef.current(); return }
    setClosing(true)
    timer.current = setTimeout(() => closeRef.current(), 180)
  }
  function outside(clientX: number, clientY: number) {
    const bounds = ref.current!.getBoundingClientRect()
    return clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom
  }
  return createPortal(
    <dialog ref={ref} tabIndex={-1} aria-label={label} aria-modal="true"
      className={`mp-sheet mp-card ${closing ? 'mp-sheet-closing' : ''} ${className}`}
      onCancel={(e) => { e.preventDefault(); dismiss() }}
      onPointerDown={(e) => { backdropPress.current = e.target === e.currentTarget && outside(e.clientX, e.clientY) }}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('[data-sheet-close]')) { dismiss(); return }
        // A drag that begins on a slider or the sheet must not dismiss it.
        if (e.target === e.currentTarget && backdropPress.current && outside(e.clientX, e.clientY)) dismiss()
        backdropPress.current = false
      }}>
      <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" aria-hidden />
      {children}
    </dialog>, document.body,
  )
}

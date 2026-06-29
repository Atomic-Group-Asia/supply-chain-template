'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Ctx = { hidden: boolean; toggle: () => void }
const PriceVisibilityCtx = createContext<Ctx>({ hidden: true, toggle: () => {} })

const STORAGE_KEY = 'atomic-ops-prices-hidden'

export function PriceVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(true) // default hidden

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === 'false') setHidden(false)
      else if (v === 'true') setHidden(true)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-prices-hidden', String(hidden))
      // When global toggle changes, clear all per-element reveals
      document.querySelectorAll('.sensitive[data-revealed]').forEach(el => el.removeAttribute('data-revealed'))
    }
  }, [hidden])

  // Fallback global handler for raw `<span className="sensitive">` usages
  // (where <Sensitive> React component isn't used). Click in capture phase
  // toggles data-revealed and stops the event reaching any row onClick handler.
  useEffect(() => {
    function onClick(e: Event) {
      if (!hidden) return
      const target = (e.target as HTMLElement | null)?.closest('.sensitive') as HTMLElement | null
      if (!target) return
      // If this is a <Sensitive> React-managed element it will have data-managed.
      // We skip those to avoid double-toggle.
      if (target.hasAttribute('data-managed')) return
      if (target.hasAttribute('data-revealed')) target.removeAttribute('data-revealed')
      else target.setAttribute('data-revealed', '')
      e.preventDefault()
      e.stopPropagation()
      ;(e as any).stopImmediatePropagation?.()
    }
    function blockOther(e: Event) {
      if (!hidden) return
      const target = (e.target as HTMLElement | null)?.closest('.sensitive') as HTMLElement | null
      if (!target) return
      if (target.hasAttribute('data-managed')) return
      e.preventDefault()
      e.stopPropagation()
      ;(e as any).stopImmediatePropagation?.()
    }
    document.addEventListener('mousedown', blockOther, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousedown', blockOther, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [hidden])

  function toggle() {
    setHidden(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }

  return <PriceVisibilityCtx.Provider value={{ hidden, toggle }}>{children}</PriceVisibilityCtx.Provider>
}

export function usePriceVisibility() {
  return useContext(PriceVisibilityCtx)
}

export function EyeToggle() {
  const { hidden, toggle } = usePriceVisibility()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Find the page's sticky breadcrumb and resolve the right-side slot.
    // Every page uses: <div className="... sticky top-0 z-10 flex items-center justify-between ...">
    // The breadcrumb has two flex children: left (title) and right (search/etc).
    // We append HIDDEN button into the RIGHT child if present, otherwise into
    // the breadcrumb itself (creating a right cluster).
    function findSlot(): HTMLElement | null {
      const candidates = document.querySelectorAll<HTMLElement>('div.sticky.top-0')
      for (const el of Array.from(candidates)) {
        if (!el.classList.contains('justify-between') || !el.classList.contains('flex')) continue
        // Skip bars that explicitly opt out (e.g. the mobile hamburger top bar)
        if (el.hasAttribute('data-no-eye-slot')) continue
        // Skip bars that are display:none at this viewport (e.g. mobile-only / desktop-only bars)
        if (window.getComputedStyle(el).display === 'none') continue
        // Find the right-side child: skip our own injected wrappers
        const directChildren = Array.from(el.children).filter(
          (c) => !(c as HTMLElement).hasAttribute('data-eye-toggle-slot'),
        ) as HTMLElement[]
        if (directChildren.length >= 2) return directChildren[directChildren.length - 1]
        return el
      }
      return null
    }

    setTarget(findSlot())

    // Re-find on route change (Next.js DOM swap)
    const observer = new MutationObserver(() => {
      const next = findSlot()
      setTarget(prev => (prev === next ? prev : next))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (!mounted) return null

  const button = (
    <button
      onClick={toggle}
      title={hidden ? 'Show prices' : 'Hide prices'}
      aria-label={hidden ? 'Show prices' : 'Hide prices'}
      style={{
        padding: '6px 10px',
        background: hidden ? '#1A1A1A' : 'white',
        color: hidden ? 'white' : '#1A1A1A',
        border: '1px solid #D4D0C7',
        borderRadius: '6px',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
      }}
    >
      {hidden ? '👁‍🗨' : '👁'}
      <span style={{ fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {hidden ? 'Hidden' : 'Visible'}
      </span>
    </button>
  )

  // Preferred: inject into the page's sticky breadcrumb (right-side slot).
  // Because the breadcrumb is sticky top-0, the button rides along during scroll.
  if (target) {
    return createPortal(
      <span
        data-eye-toggle-slot=""
        style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '8px' }}
      >
        {button}
      </span>,
      target,
    )
  }

  // Fallback only on desktop — on mobile the MobileTopBar renders its
  // own inline button, so we don't want a floating duplicate.
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
    return null
  }
  return createPortal(
    <div style={{ position: 'fixed', top: '12px', right: '14px', zIndex: 9999 }}>
      {button}
    </div>,
    document.body,
  )
}

/**
 * Wrap any sensitive content (RM amounts, supplier names, etc).
 * - When globally hidden, masked by CSS (eye icon).
 * - Click on the mask reveals just this element. Click again to re-hide.
 * - Stops propagation so the parent row's onClick (navigation) doesn't fire.
 */
export function Sensitive({ children, className }: { children: React.ReactNode; className?: string }) {
  const { hidden } = usePriceVisibility()
  const [revealed, setRevealed] = useState(false)

  // When global toggle changes, reset per-element reveal
  useEffect(() => { setRevealed(false) }, [hidden])

  function stopAll(e: React.MouseEvent) {
    if (!hidden) return // when visible, do nothing — allow row navigation
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <span
      className={`sensitive ${className || ''}`}
      data-managed=""
      data-revealed={hidden && revealed ? '' : undefined}
      onClick={(e) => {
        if (!hidden) return
        e.preventDefault()
        e.stopPropagation()
        setRevealed(prev => !prev)
      }}
      onMouseDown={stopAll}
      onMouseUp={stopAll}
    >
      {children}
    </span>
  )
}

/** Format RM amount with 3 decimals, wrapped in sensitive span. */
export function RM({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || isNaN(Number(value))) return <span className={className}>—</span>
  const formatted = `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
  return <span className={`sensitive ${className || ''}`}>{formatted}</span>
}


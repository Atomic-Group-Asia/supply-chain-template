'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { usePriceVisibility } from './PriceVisibility'

type Ctx = {
  /** Mobile drawer open state */
  open: boolean
  setOpen: (v: boolean) => void
  /** Desktop sidebar hidden state */
  collapsed: boolean
  toggleCollapsed: () => void
}
const SidebarContext = createContext<Ctx>({
  open: false, setOpen: () => {}, collapsed: false, toggleCollapsed: () => {},
})

export function useSidebar() { return useContext(SidebarContext) }

const COLLAPSE_KEY = 'atomic-ops-sidebar-collapsed'

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  // Close drawer whenever route changes (mobile nav UX expectation)
  useEffect(() => { setOpen(false) }, [pathname])

  // Hydrate desktop collapsed state from localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch {}
  }, [])

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ open, setOpen, collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

/** Layout grid wrapper — adjusts column template based on desktop collapsed state.
 *  Also sets a data attribute on documentElement so CSS rules elsewhere
 *  (e.g. pushing page breadcrumb leftpadding) can react. */
export function LayoutGrid({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  const pathname = usePathname()
  const isStandalone = pathname?.startsWith('/logout') || pathname?.startsWith('/login')
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? 'true' : 'false'
  }, [collapsed])
  return (
    <div className={`min-h-screen ${isStandalone || collapsed ? 'md:block' : 'md:grid md:grid-cols-[240px_1fr]'}`}>
      {children}
    </div>
  )
}

/** Floating 'Show sidebar' button — appears top-left on desktop when sidebar is collapsed. */
export function DesktopSidebarShowButton() {
  const { collapsed, toggleCollapsed } = useSidebar()
  const pathname = usePathname()
  if (pathname?.startsWith('/logout') || pathname?.startsWith('/login')) return null
  if (!collapsed) return null
  return (
    <button
      onClick={toggleCollapsed}
      aria-label="Show navigation"
      title="Show navigation"
      className="hidden md:flex fixed top-2 left-3 z-30 w-9 h-9 items-center justify-center rounded border border-[#D4D0C7] bg-white shadow-sm hover:bg-[#FAFAF7]"
    >
      {/* Sidebar-open icon: panel with arrow pointing OUT of the panel */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#1A1A1A]">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <path d="m14 9 3 3-3 3" />
      </svg>
    </button>
  )
}

/** Hamburger + brand strip shown only on mobile (< md). Fixed at top. */
export function MobileTopBar() {
  const { open, setOpen } = useSidebar()
  const pathname = usePathname()
  if (pathname?.startsWith('/logout') || pathname?.startsWith('/login')) return null
  return (
    <div data-no-eye-slot className="md:hidden sticky top-0 z-30 bg-[#1A1A1A] text-[#FAFAF7] px-3 py-2 flex items-center gap-2 border-b border-white/10">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        className="w-8 h-8 flex flex-col justify-center items-center gap-[3px] shrink-0"
      >
        <span className={`block w-4 h-0.5 bg-white transition-transform ${open ? 'translate-y-1.5 rotate-45' : ''}`}></span>
        <span className={`block w-4 h-0.5 bg-white transition-opacity ${open ? 'opacity-0' : ''}`}></span>
        <span className={`block w-4 h-0.5 bg-white transition-transform ${open ? '-translate-y-1.5 -rotate-45' : ''}`}></span>
      </button>
      <div className="text-[13px] font-medium tracking-tight">Supply Chain</div>
      <div className="ml-auto flex items-center gap-1.5">
        <MobileEyeButton />
        <MobileLogoutButton />
      </div>
    </div>
  )
}

/** Eye toggle button rendered INLINE inside MobileTopBar.
 *  Desktop uses the portal-injected EyeToggle inside the page breadcrumb;
 *  mobile uses this inline version because the breadcrumb is hidden. */
function MobileEyeButton() {
  const { hidden, toggle } = usePriceVisibility()
  return (
    <button
      onClick={toggle}
      aria-label={hidden ? 'Show prices' : 'Hide prices'}
      title={hidden ? 'Show prices' : 'Hide prices'}
      className="flex items-center gap-1 px-2 py-1 rounded border border-white/20 hover:bg-white/10 text-[10px] font-mono uppercase tracking-wider"
    >
      <span>{hidden ? '👁‍🗨' : '👁'}</span>
      <span>{hidden ? 'Hid' : 'Vis'}</span>
    </button>
  )
}

/** Logout button rendered INLINE inside MobileTopBar. Same role as the
 *  portal-injected HeaderLogoutButton but suited to the dark mobile bar. */
function MobileLogoutButton() {
  async function doLogout() {
    try { await fetch('/api/logout', { method: 'POST', cache: 'no-store' }) } catch {}
    window.location.href = '/login'
  }
  return (
    <button
      onClick={doLogout}
      aria-label="Sign out"
      title="Sign out"
      className="flex items-center gap-1 px-2 py-1 rounded border border-white/20 hover:bg-white/10 text-[10px] font-mono uppercase tracking-wider"
    >⏻ Out</button>
  )
}

/** Backdrop overlay shown when mobile drawer is open. */
export function MobileBackdrop() {
  const { open, setOpen } = useSidebar()
  if (!open) return null
  return (
    <div
      onClick={() => setOpen(false)}
      className="md:hidden fixed inset-0 z-40 bg-black/40"
      aria-hidden="true"
    />
  )
}

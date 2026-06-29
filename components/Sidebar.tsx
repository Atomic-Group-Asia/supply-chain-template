'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useCurrentUser } from './CurrentUserContext'
import { useSidebar } from './SidebarMobile'
import { COMPANY_NAME, WAREHOUSES, AGENT_ENABLED } from '@/lib/config'

type NavItem = {
  label: string
  href: string
  badge?: string
  badgeColor?: 'red' | 'green' | 'amber'
}

type Section = { label: string; items: NavItem[]; defaultOpen?: boolean; collapsible?: boolean }

const sections: Section[] = [
  ...(AGENT_ENABLED ? [{
    label: 'Primary',
    collapsible: false,
    items: [
      { label: '💬 Agent', href: '/agent', badge: 'AI', badgeColor: 'green' as const },
    ],
  }] : []),
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Approvals', href: '/approvals' },
      { label: 'Alerts', href: '/alerts' },
      { label: 'Purchase Decisions', href: '/purchase-decisions' },
      { label: 'FG Inventory', href: '/fg-inventory' },
    ],
  },
  {
    label: 'Operations',
    defaultOpen: false,
    items: [
      { label: 'Purchase Orders', href: '/purchase-orders' },
      { label: 'Stock Commitments', href: '/stock-commitments' },
      { label: 'Stock Movements', href: '/stock-movements' },
      { label: 'Batches', href: '/batches' },
      { label: 'Bundles', href: '/bundles' },
    ],
  },
  {
    label: 'Master Data',
    defaultOpen: false,
    items: [
      { label: 'Products', href: '/products' },
      { label: 'Packaging', href: '/packaging' },
      { label: 'Bill of Materials', href: '/bom' },
      { label: 'Suppliers', href: '/suppliers' },
      { label: `${WAREHOUSES.hq} Stock`,       href: '/hq-stock' },
      { label: `${WAREHOUSES.retailer} Stock`, href: '/o2o-stock' },
    ],
  },
  {
    label: 'Governance',
    defaultOpen: false,
    items: [
      { label: 'Governance & Learning', href: '/governance' },
    ],
  },
  {
    label: 'Settings',
    defaultOpen: false,
    items: [
      { label: 'Access Control', href: '/access-control' },
    ],
  },
]

const badgeColors = {
  red: 'bg-[#C8432C] text-white',
  green: 'bg-[#4A6B3D] text-white',
  amber: 'bg-[#B8860B] text-white',
}

const STORAGE_KEY = 'supply-chain-template-sidebar-sections'

export default function Sidebar({ role = 'admin' }: { role?: 'admin' | 'viewer' }) {
  const pathname = usePathname()
  const { current, setCurrentName, all } = useCurrentUser()
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const { open: mobileOpen, collapsed, toggleCollapsed } = useSidebar()

  const initialOpen: Record<string, boolean> = {}
  for (const s of sections) initialOpen[s.label] = s.defaultOpen ?? true
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(initialOpen)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setOpenMap(prev => ({ ...prev, ...saved }))
      }
    } catch {}
  }, [])

  useEffect(() => {
    for (const s of sections) {
      if (s.items.some(i => i.href === pathname || (i.href !== '/' && pathname.startsWith(i.href + '/')))) {
        setOpenMap(prev => prev[s.label] ? prev : { ...prev, [s.label]: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  function toggle(label: string) {
    setOpenMap(prev => {
      const next = { ...prev, [label]: !prev[label] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <aside className={`bg-[#1A1A1A] text-[#FAFAF7] flex flex-col overflow-y-auto z-50
      md:sticky md:top-0 md:h-screen
      fixed top-0 left-0 h-screen w-[260px] transition-transform duration-200
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      ${collapsed ? 'md:hidden' : 'md:translate-x-0 md:block'}`}>
      <div className="p-5 border-b border-white/10 flex items-start justify-between gap-2">
        <div>
          <div className="text-xl font-medium tracking-tight">{COMPANY_NAME}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 font-mono mt-0.5">
            Supply Chain
          </div>
        </div>
        <button
          onClick={toggleCollapsed}
          title="Hide sidebar"
          aria-label="Hide sidebar"
          className="hidden md:flex w-7 h-7 items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <path d="m16 15-3-3 3-3" />
          </svg>
        </button>
      </div>

      <div className="relative px-3 py-3 mx-3 my-3 bg-white/5 rounded border border-white/10">
        <button
          onClick={() => setShowRoleMenu(v => !v)}
          className="w-full text-left cursor-pointer hover:bg-white/5 -m-1 p-1 rounded"
        >
          <div className="text-[9px] uppercase tracking-widest text-white/40 font-mono mb-1">Viewing as</div>
          <div className="text-[13px] font-medium">{current.name} · {current.title.split(' · ')[0]}</div>
          <div className="text-[10px] font-mono text-white/50 mt-0.5">{showRoleMenu ? 'Choose role ↑' : 'Click to switch role →'}</div>
        </button>
        {showRoleMenu && (
          <div className="absolute left-0 right-0 top-full mt-1 mx-3 bg-[#2A2A2A] border border-white/10 rounded shadow-xl z-50 overflow-hidden">
            {all.map(u => (
              <button
                key={u.name}
                onClick={() => { setCurrentName(u.name); setShowRoleMenu(false) }}
                className={`w-full px-3 py-2 text-left text-[12px] hover:bg-white/10 ${current.name === u.name ? 'bg-white/5' : ''}`}
              >
                <div className="font-medium">{u.name}</div>
                <div className="text-[10px] text-white/50 font-mono">{u.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1">
        {sections.map((section) => {
          const collapsible = section.collapsible !== false
          const open = collapsible ? !!openMap[section.label] : true
          return (
            <div key={section.label} className="py-2">
              {collapsible ? (
                <button
                  onClick={() => toggle(section.label)}
                  className="w-full flex items-center justify-between px-5 pb-1.5 text-[10px] uppercase tracking-widest font-mono transition-colors"
                  style={{ color: '#7BA068' }}
                >
                  <span>{section.label}</span>
                  <span className="text-[9px]">{open ? '▾' : '▸'}</span>
                </button>
              ) : (
                <div className="px-5 pb-1.5 text-[10px] uppercase tracking-widest text-white/40 font-mono">
                  {section.label}
                </div>
              )}
              {open && section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-5 py-2 text-[13px] border-l-2 transition-colors ${
                      isActive
                        ? 'bg-[#C8432C]/20 border-[#C8432C] text-[#FAFAF7]'
                        : 'border-transparent text-white/80 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${badgeColors[item.badgeColor || 'red']}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto px-5 py-4 border-t border-white/10 text-[13px]">
        <div className="font-medium">{current.name}</div>
        <div className="text-[10px] uppercase tracking-wider text-white/50 font-mono mt-0.5">
          {current.title}
        </div>
      </div>

      <div className="px-5 py-2.5 border-t border-white/5 font-mono text-[10px] text-white/50 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]"></span>
          <span>Demo mode</span>
        </div>
      </div>
    </aside>
  )
}

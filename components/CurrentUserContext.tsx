'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Role = 'admin' | 'ops'

export type User = {
  name: string
  role: Role
  title: string
}

// Demo users — swap with real auth-backed identities in your fork.
export const USERS: Record<string, User> = {
  Admin:   { name: 'Admin',   role: 'admin', title: 'Operations Lead · Admin' },
  Drafter: { name: 'Drafter', role: 'ops',   title: 'Operations · PO Drafter' },
  Viewer:  { name: 'Viewer',  role: 'ops',   title: 'Operations · Read-only' },
}

type Ctx = {
  current: User
  setCurrentName: (name: string) => void
  all: User[]
}

const CurrentUserCtx = createContext<Ctx>({
  current: USERS.Admin,
  setCurrentName: () => {},
  all: Object.values(USERS),
})

const STORAGE_KEY = 'supply-chain-template-current-user'

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string>('Admin')

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v && USERS[v]) setName(v)
    } catch {}
  }, [])

  function setCurrentName(n: string) {
    if (!USERS[n]) return
    setName(n)
    try { localStorage.setItem(STORAGE_KEY, n) } catch {}
  }

  return (
    <CurrentUserCtx.Provider value={{ current: USERS[name], setCurrentName, all: Object.values(USERS) }}>
      {children}
    </CurrentUserCtx.Provider>
  )
}

export function useCurrentUser() {
  return useContext(CurrentUserCtx)
}

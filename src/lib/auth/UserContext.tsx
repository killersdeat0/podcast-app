'use client'

import { createContext, useContext } from 'react'

interface UserContextValue {
  isGuest: boolean
  tier: 'free' | 'paid'
}

const UserContext = createContext<UserContextValue>({ isGuest: true, tier: 'free' })

export function UserProvider({
  children,
  isGuest,
  tier,
}: {
  children: React.ReactNode
  isGuest: boolean
  tier: 'free' | 'paid'
}) {
  return <UserContext.Provider value={{ isGuest, tier }}>{children}</UserContext.Provider>
}

export function useUser() {
  return useContext(UserContext)
}

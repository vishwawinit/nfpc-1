'use client'

import React, { createContext, useContext, ReactNode } from 'react'

interface SecurityContextType {
  isAuthorized: boolean
  isLoading: boolean
  referrerValid: boolean
  checkReferrer: () => Promise<boolean>
  errorMessage: string | null
}

const defaultContextValue: SecurityContextType = {
  isAuthorized: true,
  isLoading: false,
  referrerValid: true,
  checkReferrer: async () => true,
  errorMessage: null
}

const SecurityContext = createContext<SecurityContextType>(defaultContextValue)

export const useSecurityContext = () => {
  const context = useContext(SecurityContext)
  if (!context) {
    throw new Error('useSecurityContext must be used within a SecurityProvider')
  }
  return context
}

interface SecurityProviderProps {
  children: ReactNode
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  return (
    <SecurityContext.Provider value={defaultContextValue}>
      {children}
    </SecurityContext.Provider>
  )
}

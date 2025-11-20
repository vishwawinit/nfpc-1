'use client'

import React, { createContext, useContext, ReactNode } from 'react'

interface SecurityContextType {
  isAuthorized: boolean
  isLoading: boolean
  referrerValid: boolean
  checkReferrer: () => Promise<boolean>
  errorMessage: string | null
}

// Authentication removed - always authorized
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
    // Return default context if not within provider (for backwards compatibility)
    return defaultContextValue
  }
  return context
}

interface SecurityProviderProps {
  children: ReactNode
}

// Authentication removed - just render children
export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  return (
    <SecurityContext.Provider value={defaultContextValue}>
      {children}
    </SecurityContext.Provider>
  )
}

'use client'

import React, { ReactNode } from 'react'

interface SecurityGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

// Authentication removed - always render children
export const SecurityGuard: React.FC<SecurityGuardProps> = ({ children }) => {
  return <>{children}</>
}

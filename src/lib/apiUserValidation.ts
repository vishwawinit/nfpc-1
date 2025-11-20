/**
 * API User Validation Helper
 * Authentication removed - all users are allowed
 */

import { NextResponse } from 'next/server'

interface UserValidationResult {
  isValid: boolean
  userCode: string
  childUsers?: string[]
  error?: string
  response?: NextResponse
}

// Authentication removed - always return valid
export async function validateApiUser(loginUserCode: string | null): Promise<UserValidationResult> {
  return {
    isValid: true,
    userCode: loginUserCode || 'admin',
    childUsers: []
  }
}

// Authentication removed - return empty array (no restrictions)
export async function getAllowedUserCodes(_loginUserCode: string | null): Promise<string[]> {
  return []
}

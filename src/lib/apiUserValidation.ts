/**
 * API User Validation Helper
 * For the local build we allow every user so that dashboards can run without
 * connecting to MSSQL or enforcing hierarchy checks.
 */

import { NextResponse } from 'next/server'

interface UserValidationResult {
  isValid: boolean
  userCode: string
  childUsers?: string[]
  error?: string
  response?: NextResponse
}

export async function validateApiUser(loginUserCode: string | null): Promise<UserValidationResult> {
    return {
      isValid: true,
      userCode: loginUserCode || 'admin',
      childUsers: []
    }
  }
  
export async function getAllowedUserCodes(_loginUserCode: string | null): Promise<string[]> {
    return []
}

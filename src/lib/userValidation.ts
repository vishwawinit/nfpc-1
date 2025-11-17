/**
 * Local-only user validation: always treat users as valid so the
 * dashboard can run without MSSQL hierarchy checks.
 */

interface ValidationResult {
  isValid: boolean
  error?: string
  childUsers?: string[]
}

export async function validateUser(_userCode: string | null | undefined): Promise<ValidationResult> {
    return { isValid: true, childUsers: [] }
  }
  
export function useUserValidation(_userCode: string | null | undefined) {
  return true
}

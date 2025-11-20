/**
 * Authentication removed - all hierarchy helpers return permissive defaults
 */

export async function getMSSQLConnection() {
  throw new Error('MSSQL access is disabled in local mode')
}

export async function closeMSSQLConnection() {
  // no-op
}

// Authentication removed - return empty array (no user restrictions)
export async function getChildUsers(_userCode: string): Promise<string[]> {
  return []
}

// Authentication removed - everyone is admin
export function isAdmin(_userCode: string): boolean {
  return true
}

export async function getUserHierarchyInfo(userCode: string): Promise<{
  userCode: string
  allSubordinates: string[]
  teamLeaders: string[]
  fieldUsers: string[]
  isTeamLeader: boolean
}> {
      return {
    userCode,
        allSubordinates: [],
        teamLeaders: [],
        fieldUsers: [],
        isTeamLeader: false
  }
}

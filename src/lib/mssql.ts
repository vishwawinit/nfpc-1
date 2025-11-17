/**
 * MSSQL access has been disabled for the local build. All hierarchy helpers now
 * return permissive defaults so the application runs without authentication.
 */

export async function getMSSQLConnection() {
  throw new Error('MSSQL access is disabled in local mode')
}

export async function closeMSSQLConnection() {
  // no-op
}

export async function getChildUsers(_userCode: string): Promise<string[]> {
      return []
    }

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

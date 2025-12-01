import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

export const dynamic = 'force-dynamic'
export const revalidate = false // Disable automatic revalidation, use manual caching

const SALES_TABLE = 'flat_daily_sales_report'

// Helper to convert Date to YYYY-MM-DD string
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  let startDate: Date
  let endDate: Date

  switch(dateRange) {
    case 'today':
      startDate = new Date(year, month, day)
      endDate = new Date(year, month, day)
      break
    case 'yesterday':
      startDate = new Date(year, month, day - 1)
      endDate = new Date(year, month, day - 1)
      break
    case 'last7Days':
      startDate = new Date(year, month, day - 6)
      endDate = new Date(year, month, day)
      break
    case 'last30Days':
      startDate = new Date(year, month, day - 29)
      endDate = new Date(year, month, day)
      break
    case 'thisMonth':
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastMonth':
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(month / 3)
      startDate = new Date(year, quarter * 3, 1)
      endDate = new Date(year, month, day)
      break
    case 'thisYear':
      startDate = new Date(year, 0, 1)
      endDate = new Date(year, month, day)
      break
    default:
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
  }

  return { startDate, endDate }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'lastMonth'
    const areaCode = searchParams.get('areaCode') || null
    const subAreaCode = searchParams.get('subAreaCode') || null
    const teamLeaderCode = searchParams.get('teamLeaderCode') || null
    const fieldUserRole = searchParams.get('fieldUserRole') || null

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/returns-wastage/filters', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get date range
    const { startDate, endDate } = getDateRangeFromString(dateRange)

    const filterParams = {
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      areaCode,
      subAreaCode,
      teamLeaderCode,
      fieldUserRole
    }

    console.log('🔄 Fetching fresh returns filters from database...')
    console.log('📊 Returns Filters Query:', filterParams)

    // Build cascading WHERE clauses for hierarchical filtering
    const buildWhere = (level: string) => {
      const conditions = [
        `trx_trxdate >= '${filterParams.startDate} 00:00:00'::timestamp`,
        `trx_trxdate < ('${filterParams.endDate}'::date + INTERVAL '1 day')`,
        `trx_trxtype = 4` // Only returns
      ]

      if (level !== 'area' && areaCode) {
        conditions.push(`route_areacode = '${areaCode}'`)
      }

      if (level !== 'subArea' && level !== 'area' && subAreaCode) {
        conditions.push(`route_subareacode = '${subAreaCode}'`)
      }

      if (level !== 'teamLeader' && level !== 'subArea' && level !== 'area' && teamLeaderCode) {
        conditions.push(`route_salesmancode = '${teamLeaderCode}'`)
      }

      if (level !== 'fieldUserRole' && level !== 'teamLeader' && level !== 'subArea' && level !== 'area' && fieldUserRole) {
        conditions.push(`COALESCE(user_usertype, 'Field User') = '${fieldUserRole}'`)
      }

      return `WHERE ${conditions.join(' AND ')}`
    }

    // Execute all filter queries in parallel
    const [areasResult, subAreasResult, fieldUserRolesResult, teamLeadersResult, fieldUsersResult, routesResult] = await Promise.all([
      // Get areas
      query(`
        SELECT
          route_areacode as "value",
          route_areacode as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('area')}
        AND route_areacode IS NOT NULL
        AND route_areacode != ''
        GROUP BY route_areacode
        ORDER BY route_areacode
      `),

      // Get sub areas
      query(`
        SELECT
          route_subareacode as "value",
          route_subareacode as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('subArea')}
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
        GROUP BY route_subareacode
        ORDER BY route_subareacode
      `),

      // Get field user roles
      query(`
        SELECT
          COALESCE(user_usertype, 'Field User') as "value",
          CASE COALESCE(user_usertype, 'Field User')
            WHEN 'ATL' THEN 'Asst. Team Leader'
            ELSE COALESCE(user_usertype, 'Field User')
          END as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('fieldUserRole')}
        AND COALESCE(user_usertype, 'Field User') != 'Team Leader'
        GROUP BY user_usertype
        ORDER BY
          CASE COALESCE(user_usertype, 'Field User')
            WHEN 'ATL' THEN 1
            WHEN 'Promoter' THEN 2
            WHEN 'Merchandiser' THEN 3
            WHEN 'Field User' THEN 4
            ELSE 5
          END
      `),

      // Get team leaders
      query(`
        SELECT
          route_salesmancode as "value",
          route_salesmancode as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('teamLeader')}
        AND route_salesmancode IS NOT NULL
        AND route_salesmancode != ''
        GROUP BY route_salesmancode
        ORDER BY route_salesmancode
      `),

      // Get field users
      query(`
        SELECT
          trx_usercode as "value",
          COALESCE(MAX(user_description), trx_usercode) || ' (' || trx_usercode || ')' as "label",
          COALESCE(MAX(user_usertype), 'Field User') as "role",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('fieldUser')}
        AND trx_usercode IS NOT NULL
        AND trx_usercode != ''
        AND COALESCE(user_usertype, 'Field User') != 'Team Leader'
        GROUP BY trx_usercode
        ORDER BY MAX(user_description)
      `),

      // Get routes
      query(`
        SELECT
          trx_routecode as "value",
          COALESCE(MAX(route_name), trx_routecode) as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildWhere('route')}
        AND trx_routecode IS NOT NULL
        AND trx_routecode != ''
        GROUP BY trx_routecode
        ORDER BY MAX(route_name)
      `)
    ])

    // Format results
    const areas = areasResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.transactionCount) || 0
    }))

    const subAreas = subAreasResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.transactionCount) || 0
    }))

    const fieldUserRoles = fieldUserRolesResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.transactionCount) || 0
    }))

    const teamLeaders = teamLeadersResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.transactionCount) || 0
    }))

    const fieldUsers = fieldUsersResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      role: row.role,
      available: parseInt(row.transactionCount) || 0
    }))

    const routes = routesResult.rows.map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.transactionCount) || 0
    }))

    const responseJson = {
      success: true,
      areas,
      subAreas,
      fieldUserRoles,
      teamLeaders,
      fieldUsers,
      routes,
      timestamp: new Date().toISOString(),
      cached: false
    }

    // Store in cache
    apiCache.set('/api/returns-wastage/filters', responseJson, searchParams)

    const response = NextResponse.json(responseJson)

    // Aggressive caching for filters: 2 hours cache, 4 hours stale
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=7200, stale-while-revalidate=14400, max-age=3600'
    )

    return response

  } catch (error) {
    console.error('Returns Filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error',
      areas: [],
      subAreas: [],
      fieldUserRoles: [],
      teamLeaders: [],
      fieldUsers: [],
      routes: []
    }, { status: 500 })
  }
}

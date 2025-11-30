import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'
export const revalidate = 0 // Use cache headers instead

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
    const dateRange = searchParams.get('range') || 'thisMonth'
    const regionCode = searchParams.get('region') || 'all'
    const routeCode = searchParams.get('route') || 'all'

    // Get date range
    const { startDate, endDate } = getDateRangeFromString(dateRange)

    const filterParams = {
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      regionCode,
      routeCode
    }

    console.log('📊 Returns Filters Query:', {
      dateRange,
      startDate: filterParams.startDate,
      endDate: filterParams.endDate,
      regionCode,
      routeCode
    })

    // Build base WHERE clause (for regions)
    const baseConditions = [
      `trx_trxdate >= '${filterParams.startDate} 00:00:00'::timestamp`,
      `trx_trxdate < ('${filterParams.endDate}'::date + INTERVAL '1 day')`,
      `trx_trxtype = 4` // Only returns
    ]

    const whereClause = `WHERE ${baseConditions.join(' AND ')}`

    // Build WHERE clause for routes (includes region filter)
    const routeConditions = [...baseConditions]
    if (regionCode && regionCode !== 'all') {
      routeConditions.push(`route_areacode = '${regionCode}'`)
    }
    const routeWhereClause = `WHERE ${routeConditions.join(' AND ')}`

    // Build WHERE clause for salesmen (includes region and route filters)
    const salesmanConditions = [...baseConditions]
    if (regionCode && regionCode !== 'all') {
      salesmanConditions.push(`route_areacode = '${regionCode}'`)
    }
    if (routeCode && routeCode !== 'all') {
      salesmanConditions.push(`trx_routecode = '${routeCode}'`)
    }
    const salesmanWhereClause = `WHERE ${salesmanConditions.join(' AND ')}`

    // Optimized query - get unique code-name pairs with LIMIT for faster response
    // Use different WHERE clauses for cascading filters
    const filtersQuery = `
      SELECT
        (SELECT json_agg(jsonb_build_object('code', route_areacode, 'name', route_areacode))
         FROM (
           SELECT DISTINCT route_areacode
           FROM ${SALES_TABLE}
           ${whereClause}
           AND route_areacode IS NOT NULL AND route_areacode != ''
           LIMIT 1000
         ) t
        ) as regions,

        (SELECT json_agg(jsonb_build_object('code', trx_routecode, 'name', route_name))
         FROM (
           SELECT DISTINCT ON (trx_routecode) trx_routecode, COALESCE(route_name, trx_routecode) as route_name
           FROM ${SALES_TABLE}
           ${routeWhereClause}
           AND trx_routecode IS NOT NULL AND trx_routecode != ''
           ORDER BY trx_routecode
           LIMIT 1000
         ) t
        ) as routes,

        (SELECT json_agg(jsonb_build_object('code', trx_usercode, 'name', user_name))
         FROM (
           SELECT DISTINCT ON (trx_usercode) trx_usercode, COALESCE(user_description, trx_usercode) as user_name
           FROM ${SALES_TABLE}
           ${salesmanWhereClause}
           AND trx_usercode IS NOT NULL AND trx_usercode != ''
           ORDER BY trx_usercode
           LIMIT 1000
         ) t
        ) as salesmen
    `

    const result = await query(filtersQuery)
    const filters = result.rows[0] || {}

    // Transform to expected format
    const regions = filters.regions || []
    const routes = filters.routes || []
    const salesmen = filters.salesmen || []

    const response = NextResponse.json({
      success: true,
      regions,
      routes,
      salesmen,
      timestamp: new Date().toISOString()
    })

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
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Date range helper
function getDateRange(range: string) {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  switch (range) {
    case 'today':
      return {
        start: startOfToday,
        end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    case 'yesterday':
      const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000)
      return {
        start: yesterday,
        end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    case 'thisWeek':
      const dayOfWeek = startOfToday.getDay()
      const startOfWeek = new Date(startOfToday.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
      return { start: startOfWeek, end: today }
    case 'thisMonth':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: today
      }
    case 'lastMonth':
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
      return { start: lastMonthStart, end: lastMonthEnd }
    case 'thisQuarter':
      const currentQuarter = Math.floor(today.getMonth() / 3)
      const quarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1)
      return { start: quarterStart, end: today }
    case 'lastQuarter':
      const lastQ = Math.floor(today.getMonth() / 3) - 1
      const lastQuarterStart = lastQ < 0
        ? new Date(today.getFullYear() - 1, 9, 1)
        : new Date(today.getFullYear(), lastQ * 3, 1)
      const lastQuarterEnd = lastQ < 0
        ? new Date(today.getFullYear() - 1, 11, 31)
        : new Date(today.getFullYear(), (lastQ + 1) * 3, 0, 23, 59, 59)
      return { start: lastQuarterStart, end: lastQuarterEnd }
    case 'thisYear':
      return {
        start: new Date(today.getFullYear(), 0, 1),
        end: today
      }
    default:
      return {
        start: new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: today
      }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'lastMonth'
    const regionCode = searchParams.get('region') || searchParams.get('regionCode')

    const { start: startDate, end: endDate } = getDateRange(dateRange)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Build region filter condition
    const regionConditions: string[] = []
    const regionParams: any[] = [startDateStr, endDateStr]
    let paramIndex = 3

    if (regionCode && regionCode !== 'all') {
      regionConditions.push(`c."RegionCode" = $${paramIndex}`)
      regionParams.push(regionCode)
      paramIndex++
    }

    const regionWhereClause = regionConditions.length > 0
      ? `AND ${regionConditions.join(' AND ')}`
      : ''

    // Fetch all filter options in parallel using real tables
    const [regionsResult, salesmenResult, routesResult, channelsResult] = await Promise.all([
      // Get regions from tblRegion with customer counts
      query(`
        SELECT DISTINCT
          r."Code" as code,
          r."Description" as name,
          COUNT(DISTINCT c."Code") as route_count
        FROM "tblRegion" r
        LEFT JOIN "tblCustomer" c ON r."Code" = c."RegionCode" AND c."IsActive" = true
        WHERE r."IsActive" = true
        GROUP BY r."Code", r."Description"
        ORDER BY r."Description"
      `),

      // Get salesmen/users who have transactions in the date range
      query(`
        SELECT DISTINCT
          u."Code" as code,
          u."Description" as name
        FROM "tblUser" u
        INNER JOIN "tblTrxHeader" t ON u."Code" = t."UserCode"
        WHERE t."TrxType" = 1
          AND t."TrxDate" >= $1::timestamp
          AND t."TrxDate" < ($2::timestamp + INTERVAL '1 day')
          AND u."IsActive" = true
        ORDER BY u."Description"
      `, [startDateStr, endDateStr]),

      // Get routes with transactions in the date range
      query(`
        SELECT DISTINCT
          rt."Code" as code,
          rt."Name" as name
        FROM "tblRoute" rt
        INNER JOIN "tblTrxHeader" t ON rt."Code" = t."RouteCode"
        WHERE t."TrxType" = 1
          AND t."TrxDate" >= $1::timestamp
          AND t."TrxDate" < ($2::timestamp + INTERVAL '1 day')
          AND rt."IsActive" = true
        ORDER BY rt."Name"
      `, [startDateStr, endDateStr]),

      // Get channels from tblChannel
      query(`
        SELECT DISTINCT
          ch."Code" as code,
          ch."Description" as name
        FROM "tblChannel" ch
        WHERE ch."IsActive" = true
        ORDER BY ch."Description"
      `)
    ])

    return NextResponse.json({
      success: true,
      regions: regionsResult.rows || [],
      salesmen: salesmenResult.rows || [],
      routes: routesResult.rows || [],
      channels: channelsResult.rows || [],
      timestamp: new Date().toISOString(),
      source: 'postgresql-real-tables'
    })

  } catch (error) {
    console.error('Customer filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error',
      regions: [],
      salesmen: [],
      routes: [],
      channels: []
    }, { status: 500 })
  }
}

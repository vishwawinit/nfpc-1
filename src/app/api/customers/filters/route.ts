import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

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

    // Check cache first
    const cachedData = apiCache.get('/api/customers/filters', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

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

    // Fetch all filter options in parallel using flat_daily_sales_report table
    const [regionsResult, salesmenResult, routesResult, channelsResult] = await Promise.all([
      // Get regions/areas from transactions
      query(`
        SELECT DISTINCT
          route_areacode as code,
          route_areaname as name,
          COUNT(DISTINCT trx_routecode) as route_count
        FROM flat_daily_sales_report
        WHERE trx_trxtype = '1'
          AND trx_trxdate::date >= $1::date
          AND trx_trxdate::date <= $2::date
          AND route_areacode IS NOT NULL
        GROUP BY route_areacode, route_areaname
        ORDER BY route_areaname
      `, [startDateStr, endDateStr]),

      // Get salesmen/users who have transactions in the date range
      query(`
        SELECT DISTINCT
          trx_usercode as code,
          trx_username as name
        FROM flat_daily_sales_report
        WHERE trx_trxtype = '1'
          AND trx_trxdate::date >= $1::date
          AND trx_trxdate::date <= $2::date
          AND trx_usercode IS NOT NULL
        ORDER BY trx_username
      `, [startDateStr, endDateStr]),

      // Get routes with transactions in the date range
      query(`
        SELECT DISTINCT
          trx_routecode as code,
          route_name as name
        FROM flat_daily_sales_report
        WHERE trx_trxtype = '1'
          AND trx_trxdate::date >= $1::date
          AND trx_trxdate::date <= $2::date
          AND trx_routecode IS NOT NULL
        ORDER BY route_name
      `, [startDateStr, endDateStr]),

      // Get channels from transactions
      query(`
        SELECT DISTINCT
          customer_channelcode as code,
          customer_channel_description as name
        FROM flat_daily_sales_report
        WHERE trx_trxtype = '1'
          AND trx_trxdate::date >= $1::date
          AND trx_trxdate::date <= $2::date
          AND customer_channelcode IS NOT NULL
        ORDER BY customer_channel_description
      `, [startDateStr, endDateStr])
    ])

    const responseData = {
      success: true,
      regions: regionsResult.rows || [],
      salesmen: salesmenResult.rows || [],
      routes: routesResult.rows || [],
      channels: channelsResult.rows || [],
      timestamp: new Date().toISOString(),
      source: 'postgresql-real-tables'
    }

    // Store in cache
    apiCache.set('/api/customers/filters', responseData, searchParams)

    return NextResponse.json(responseData)

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

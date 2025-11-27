import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

/**
 * API Endpoint: GET /api/customers/top
 * Description: Fetches top customers by total sales amount
 * Query Parameters:
 *   - limit: Number of customers to return (default: 10)
 *   - range: Date range filter (thisMonth, lastMonth, thisQuarter, etc.)
 *   - startDate/endDate: Custom date range
 *   - regionCode, cityCode, teamLeaderCode, userCode, chainName, storeCode: Filter parameters
 * Returns: Array of top customers with their sales data
 */

// Optimized caching aligned with other services
function getCacheDuration(dateRange: string, hasCustomDates: boolean): number {
  if (hasCustomDates) return 900 // 15 minutes for custom dates

  switch(dateRange) {
    case 'today':
      return 300 // 5 minutes for today
    case 'yesterday':
      return 3600 // 1 hour for yesterday
    case 'thisWeek':
    case 'lastWeek':
    case 'last7Days':
      return 1800 // 30 minutes for this week
    case 'thisMonth':
    case 'last30Days':
      return 3600 // 1 hour for this month
    case 'lastMonth':
      return 21600 // 6 hours for last month (stable data)
    case 'thisQuarter':
      return 7200 // 2 hours for this quarter
    case 'lastQuarter':
      return 43200 // 12 hours for last quarter (stable data)
    case 'thisYear':
      return 10800 // 3 hours for this year
    default:
      return 900 // 15 minutes default
  }
}

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const current = new Date()
  let startDate: Date
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      startDate = new Date(current)
      break
    case 'yesterday':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'thisWeek':
    case 'last7Days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'last30Days':
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(current.getMonth() / 3)
      startDate = new Date(current.getFullYear(), quarter * 3, 1)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(current.getMonth() / 3) - 1
      startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }
}

// Build WHERE clause for filters
const buildWhereClause = (params: any) => {
  const conditions: string[] = []

  // Always filter for sales transactions
  conditions.push(`trx_trxtype = 1`)

  // Date conditions
  if (params.startDate) {
    conditions.push(`trx_trxdate >= '${params.startDate}'::timestamp`)
  }
  if (params.endDate) {
    conditions.push(`trx_trxdate < ('${params.endDate}'::timestamp + INTERVAL '1 day')`)
  }

  // Region filter
  if (params.regionCode) {
    conditions.push(`customer_regioncode = '${params.regionCode}'`)
  }

  // City filter
  if (params.cityCode) {
    conditions.push(`(customer_citycode = '${params.cityCode}' OR city_description = '${params.cityCode}')`)
  }

  // Route filter
  if (params.routeCode) {
    conditions.push(`trx_routecode = '${params.routeCode}'`)
  }

  // User filter
  if (params.userCode) {
    conditions.push(`trx_usercode = '${params.userCode}'`)
  }

  // Team leader filter
  if (params.teamLeaderCode) {
    conditions.push(`route_salesmancode = '${params.teamLeaderCode}'`)
  }

  // Channel filter
  if (params.chainName) {
    conditions.push(`customer_channel_description = '${params.chainName}'`)
  }

  // Store filter
  if (params.storeCode) {
    conditions.push(`customer_code = '${params.storeCode}'`)
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '10')
    const dateRange = searchParams.get('range') || 'thisMonth'

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('city') || searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const routeCode = searchParams.get('routeCode')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Get date range - prioritize custom dates
    let startDate: string, endDate: string
    if (customStartDate && customEndDate) {
      startDate = customStartDate
      endDate = customEndDate
    } else {
      const dateRangeResult = getDateRangeFromString(dateRange)
      startDate = dateRangeResult.startDate
      endDate = dateRangeResult.endDate
    }

    const filterParams = {
      startDate,
      endDate,
      regionCode,
      cityCode,
      teamLeaderCode,
      routeCode,
      userCode,
      chainName,
      storeCode
    }

    const whereClause = buildWhereClause(filterParams)

    console.log('🔍 Top customers query details:', {
      startDate,
      endDate,
      limit,
      filters: { regionCode, cityCode, teamLeaderCode, routeCode, userCode, chainName, storeCode },
      whereClause
    })

    // Query to get top customers with all metrics
    const topCustomersQuery = `
      SELECT
        customer_code as "customerCode",
        COALESCE(MAX(customer_description), customer_code) as "customerName",
        COALESCE(MAX(customer_channel_description), MAX(customer_channelcode), 'Unknown') as "customerType",
        COALESCE(MAX(city_description), MAX(customer_citycode), 'Unknown') as "city",
        COALESCE(MAX(region_description), MAX(customer_regioncode), 'Unknown') as "state",
        COALESCE(MAX(route_salesmancode), 'Unknown') as "salesPerson",
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as "totalSales",
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as "totalOrders",
        COUNT(DISTINCT line_itemcode) as "uniqueProducts",
        COALESCE(SUM(ABS(line_quantitybu)), 0) as "totalQuantity",
        CASE
          WHEN COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) > 0
          THEN COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) / COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END)
          ELSE 0
        END as "avgOrderValue",
        MAX(trx_trxdate) as "lastOrderDate",
        COALESCE(MAX(trx_currencycode), 'AED') as "currency"
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY customer_code
      HAVING customer_code IS NOT NULL
      ORDER BY COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) DESC
      LIMIT ${limit}
    `

    const result = await query(topCustomersQuery)

    console.log('✅ Top customers query executed successfully')
    console.log('📊 Query returned:', result.rows.length, 'rows')

    if (result.rows.length > 0) {
      console.log('💰 Sample customer data:', result.rows[0])
    } else {
      console.log('⚠️ No customers found with current filters')
    }

    const customers = result.rows.map(row => ({
      customerCode: String(row.customerCode || 'Unknown'),
      customerName: String(row.customerName || 'Unknown Customer'),
      totalSales: Number(row.totalSales) || 0,
      customerType: String(row.customerType || 'Unknown'),
      city: String(row.city || 'Unknown'),
      state: String(row.state || 'Unknown'),
      salesPerson: String(row.salesPerson || 'Unknown'),
      totalOrders: Number(row.totalOrders) || 0,
      uniqueProducts: Number(row.uniqueProducts) || 0,
      avgOrderValue: Number(row.avgOrderValue) || 0,
      totalQuantity: Number(row.totalQuantity) || 0,
      lastOrderDate: row.lastOrderDate || null,
      currency: String(row.currency || 'AED')
    }))

    // Calculate cache duration
    const hasCustomDates = !!(customStartDate && customEndDate)
    const cacheDuration = getCacheDuration(dateRange, hasCustomDates)
    const staleWhileRevalidate = cacheDuration * 2

    return NextResponse.json({
      success: true,
      data: customers,
      timestamp: new Date().toISOString(),
      cached: true,
      cacheInfo: {
        duration: cacheDuration,
        dateRange,
        hasCustomDates
      },
      source: 'flat_daily_sales_report'
    }, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheDuration}, stale-while-revalidate=${staleWhileRevalidate}`
      }
    })

  } catch (error) {
    console.error('❌ TOP CUSTOMERS API CRITICAL ERROR:', error)
    console.error('🔍 Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('💬 Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('📚 Stack trace:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('🎯 Request details:', {
      url: request.url,
      method: request.method,
      searchParams: request.nextUrl.searchParams.toString()
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch top customers',
      message: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error instanceof Error ? error.stack : 'No stack trace',
        fullError: error
      } : undefined
    }, { status: 500 })
  }
}

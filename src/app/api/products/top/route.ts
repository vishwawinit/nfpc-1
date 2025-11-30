import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

// Enable caching with revalidation based on Cache-Control headers
export const dynamic = 'force-dynamic'
export const revalidate = false // Use manual caching

const SALES_TABLE = 'flat_daily_sales_report'

// Helper to convert Date to YYYY-MM-DD string in local timezone (no UTC conversion)
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * API Endpoint: GET /api/products/top
 * Description: Fetches top products by sales amount
 * Query Parameters:
 *   - limit: Number of products to return (default: 10)
 *   - range: Date range filter (thisMonth, lastMonth, thisQuarter, etc.)
 *   - startDate/endDate: Custom date range
 *   - regionCode, cityCode, teamLeaderCode, userCode, chainName, storeCode: Filter parameters
 * Returns: Array of top products with their sales data
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

// Helper function to parse date range string (UTC-safe)
const getDateRangeFromString = (dateRange: string) => {
  // Get current date in local timezone, extract components
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
    case 'thisWeek':
    case 'last7Days':
      startDate = new Date(year, month, day - 6)
      endDate = new Date(year, month, day)
      break
    case 'last30Days':
      startDate = new Date(year, month, day - 29)
      endDate = new Date(year, month, day)
      break
    case 'thisMonth':
      // This month: 1st day to TODAY (inclusive)
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastMonth':
      // Last month: 1st to last day of previous month
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
      break
    case 'thisQuarter':
      // This quarter: 1st day of quarter to TODAY (inclusive)
      const quarter = Math.floor(month / 3)
      startDate = new Date(year, quarter * 3, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastQuarter':
      // Last quarter: 1st to last day of previous quarter
      const lastQuarter = Math.floor(month / 3) - 1
      startDate = new Date(year, lastQuarter * 3, 1)
      endDate = new Date(year, lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      // This year: Jan 1 to TODAY (inclusive)
      startDate = new Date(year, 0, 1)
      endDate = new Date(year, month, day)
      break
    default:
      startDate = new Date(year, month, day - 29)
      endDate = new Date(year, month, day)
  }

  return {
    startDate: toLocalDateString(startDate),
    endDate: toLocalDateString(endDate)
  }
}

// Build WHERE clause for filters
const buildWhereClause = (params: any) => {
  const conditions: string[] = []

  // Always filter for sales transactions
  conditions.push(`trx_trxtype = 1`)

  // Date conditions - use indexed timestamp ranges for performance
  // Database is in UTC, so we use timestamp ranges that cover the full date
  if (params.startDate) {
    conditions.push(`trx_trxdate >= '${params.startDate} 00:00:00'::timestamp`)
  }
  if (params.endDate) {
    // Add 1 day and use < instead of <= to get all records on endDate
    conditions.push(`trx_trxdate < ('${params.endDate}'::date + INTERVAL '1 day')`)
  }

  // Area filter (support both old regionCode and new areaCode)
  if (params.areaCode || params.regionCode) {
    conditions.push(`route_areacode = '${params.areaCode || params.regionCode}'`)
  }

  // Sub Area filter (support both old cityCode and new subAreaCode)
  if (params.subAreaCode || params.cityCode) {
    conditions.push(`route_subareacode = '${params.subAreaCode || params.cityCode}'`)
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

  // Ensure we have valid product and quantity data
  conditions.push(`line_itemcode IS NOT NULL`)
  conditions.push(`COALESCE(line_quantitybu, 0) != 0`)

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '10')
    const dateRange = searchParams.get('range') || 'thisMonth'

    // Get filter parameters - support both old (region/city) and new (area/subArea) names
    const areaCode = searchParams.get('areaCode') || searchParams.get('regionCode')
    const subAreaCode = searchParams.get('subAreaCode') || searchParams.get('city') || searchParams.get('cityCode')
    const regionCode = searchParams.get('regionCode') // Keep for backward compatibility
    const cityCode = searchParams.get('city') || searchParams.get('cityCode') // Keep for backward compatibility
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const routeCode = searchParams.get('routeCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/products/top', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

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
      areaCode,
      subAreaCode,
      regionCode, // Keep for backward compatibility in WHERE clause
      cityCode, // Keep for backward compatibility in WHERE clause
      teamLeaderCode,
      routeCode,
      userCode,
      chainName,
      storeCode
    }

    const whereClause = buildWhereClause(filterParams)

    console.log('🔍 Top products query details:', {
      startDate,
      endDate,
      limit,
      filters: { regionCode, cityCode, teamLeaderCode, routeCode, userCode, chainName, storeCode },
      whereClause
    })

    // Query to get top products with all metrics
    const topProductsQuery = `
      SELECT
        line_itemcode as "productCode",
        COALESCE(MAX(COALESCE(line_itemdescription, item_description)), line_itemcode) as "productName",
        COALESCE(MAX(item_grouplevel1), 'Unknown') as "categoryName",
        COALESCE(MAX(line_uom), 'PCS') as "baseUom",
        SUM(ABS(COALESCE(line_quantitybu, 0))) as "quantitySold",
        COALESCE(CAST(SUM(CASE
          WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu)
          ELSE 0
        END) AS NUMERIC(15,2)), 0) as "salesAmount",
        CASE
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0
          THEN COALESCE(CAST(SUM(CASE
            WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu)
            ELSE 0
          END) / SUM(ABS(COALESCE(line_quantitybu, 0))) AS NUMERIC(15,2)), 0)
          ELSE 0
        END as "averagePrice",
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as "totalOrders",
        COUNT(DISTINCT customer_code) as "uniqueCustomers",
        MAX(trx_trxdate) as "lastSoldDate",
        COALESCE(MAX(trx_currencycode), 'AED') as "currency"
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY line_itemcode
      ORDER BY COALESCE(SUM(CASE
        WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu)
        ELSE 0
      END), 0) DESC
      LIMIT ${limit}
    `

    const result = await query(topProductsQuery)

    console.log('✅ Top products query executed successfully')
    console.log('📊 Query returned:', result.rows.length, 'rows')

    if (result.rows.length > 0) {
      console.log('🏆 Sample product data:', result.rows[0])
    } else {
      console.log('⚠️ No products found with current filters')
    }

    const topProducts = result.rows.map(row => ({
      productCode: String(row.productCode || 'Unknown'),
      productName: String(row.productName || 'Unknown Product'),
      category: String(row.categoryName || 'Unknown'),
      baseUom: String(row.baseUom || 'PCS'),
      quantitySold: Number(row.quantitySold) || 0,
      salesAmount: Number(row.salesAmount) || 0,
      averagePrice: Number(row.averagePrice) || 0,
      totalOrders: Number(row.totalOrders) || 0,
      uniqueCustomers: Number(row.uniqueCustomers) || 0,
      lastSoldDate: row.lastSoldDate || null,
      currency: String(row.currency || 'AED')
    }))

    // Prepare response
    const responseData = {
      success: true,
      data: topProducts,
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'flat_daily_sales_report'
    }

    // Store in cache
    apiCache.set('/api/products/top', searchParams, responseData)

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('❌ TOP PRODUCTS API CRITICAL ERROR:', error)
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
      error: 'Failed to fetch top products',
      message: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error instanceof Error ? error.stack : 'No stack trace',
        fullError: error
      } : undefined
    }, { status: 500 })
  }
}

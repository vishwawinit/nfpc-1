import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

/**
 * API Endpoint: GET /api/customers/top
 * Description: Fetches top customers by total sales amount
 * Query Parameters:
 *   - limit: Number of customers to return (default: 10)
 *   - range: Date range filter (thisMonth, lastMonth, thisQuarter, etc.)
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '10')
    const dateRange = searchParams.get('range') || 'thisMonth'

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('city') || searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')
    
    // Get loginUserCode for hierarchy-based filtering
    const loginUserCode = searchParams.get('loginUserCode')
    
    // Fetch child users if loginUserCode is provided
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
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

    // Build WHERE conditions
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Optimized date range filter - use direct date comparison for index usage
    if (startDate && endDate) {
      conditions.push(`t.transaction_date >= $${paramIndex}::date`)
      params.push(startDate)
      paramIndex++
      conditions.push(`t.transaction_date < ($${paramIndex}::date + INTERVAL '1 day')`)
      params.push(endDate)
      paramIndex++
    }

    // Region filter - use state from customers master
    if (regionCode) {
      conditions.push(`c.state = $${paramIndex}`)
      params.push(regionCode)
      paramIndex++
    }

    // City filter
    if (cityCode) {
      conditions.push(`c.city = $${paramIndex}`)
      params.push(cityCode)
      paramIndex++
    }

    // Team Leader filter - using sales_person_code
    if (teamLeaderCode) {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
      params.push(teamLeaderCode)
      paramIndex++
    }

    // Field User Role filter - using sales_person_code
    if (fieldUserRole) {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
      params.push(fieldUserRole)
      paramIndex++
    }

    // User filter
    if (userCode) {
      conditions.push(`t.user_code = $${paramIndex}`)
      params.push(userCode)
      paramIndex++
    }

    // Chain filter - using customer_type
    const chainName = searchParams.get('chainName')
    if (chainName) {
      conditions.push(`c.customer_type = $${paramIndex}`)
      params.push(chainName)
      paramIndex++
    }

    // Store filter
    const storeCode = searchParams.get('storeCode')
    if (storeCode) {
      conditions.push(`t.customer_code = $${paramIndex}`)
      params.push(storeCode)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Add limit param
    params.push(limit)
    const limitParam = `$${paramIndex}`

    // Log for debugging
    console.log('Top customers query params:', { startDate, endDate, limit, conditions: conditions.length })

    // Log query details for debugging
    console.log('🔍 Top customers query details:', {
      startDate,
      endDate,
      limit,
      filters: {
        regionCode,
        cityCode,
        teamLeaderCode,
        fieldUserRole,
        userCode,
        chainName,
        storeCode
      },
      whereClause,
      paramCount: params.length
    })

    // Build query with date filtering
    console.log('🔄 Using customers query with date filters, limit:', limit)
    
    // Build final query with all filters
    console.log('🔄 Building top customers query with filters')
    console.log('📊 Query conditions:', { whereClause, paramCount: params.length, limit })
    
    // Construct the final WHERE clause
    let finalConditions = []
    let queryParams = []
    let currentParamIndex = 1
    
    // Add date conditions if they exist - optimized for index usage
    if (startDate && endDate) {
      finalConditions.push(`t."TrxDate" >= $${currentParamIndex}::timestamp`)
      queryParams.push(startDate)
      currentParamIndex++

      finalConditions.push(`t."TrxDate" < ($${currentParamIndex}::timestamp + INTERVAL '1 day')`)
      queryParams.push(endDate)
      currentParamIndex++
    }

    // Only include invoices/sales (TrxType = 1)
    finalConditions.push(`t."TrxType" = 1`)

    // Add other filters
    if (regionCode) {
      finalConditions.push(`c."RegionCode" = $${currentParamIndex}`)
      queryParams.push(regionCode)
      currentParamIndex++
    }

    // City filter - disabled as City column may not exist
    // if (cityCode) {
    //   finalConditions.push(`c."City" = $${currentParamIndex}`)
    //   queryParams.push(cityCode)
    //   currentParamIndex++
    // }

    if (userCode) {
      finalConditions.push(`t."UserCode" = $${currentParamIndex}`)
      queryParams.push(userCode)
      currentParamIndex++
    }

    // Always include these base conditions
    finalConditions.push('t."ClientCode" IS NOT NULL')
    finalConditions.push('t."TotalAmount" IS NOT NULL')
    
    const finalWhere = finalConditions.length > 0 ? `WHERE ${finalConditions.join(' AND ')}` : ''
    
    // Add limit parameter
    queryParams.push(limit)
    
    console.log('🎯 Final query conditions:', {
      finalWhere,
      queryParams: queryParams.map((p, i) => `$${i+1}: ${p}`)
    })
    
    const result = await query(`
      SELECT
        t."ClientCode" as "customerCode",
        COALESCE(MAX(c."Description"), 'Unknown Customer') as "customerName",
        COUNT(DISTINCT t."TrxCode") as "totalOrders",
        COALESCE(MAX(c."RouteCode"), 'Unknown') as "customerType",
        'Unknown' as "city",
        COALESCE(MAX(c."RegionCode"), 'Unknown') as "state",
        COALESCE(MAX(c."SalesmanCode"), 'Unknown') as "salesPerson",
        COALESCE(SUM(CASE WHEN t."TotalAmount" > 0 THEN t."TotalAmount" ELSE 0 END), 0) as "totalSales",
        CASE WHEN COUNT(DISTINCT t."TrxCode") > 0 THEN COALESCE(SUM(CASE WHEN t."TotalAmount" > 0 THEN t."TotalAmount" ELSE 0 END), 0) / COUNT(DISTINCT t."TrxCode") ELSE 0 END as "avgOrderValue",
        MAX(t."TrxDate") as "lastOrderDate",
        COALESCE(MAX(t."CurrencyCode"), 'AED') as "currency"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      ${finalWhere}
      GROUP BY t."ClientCode"
      ORDER BY SUM(CASE WHEN t."TotalAmount" > 0 THEN t."TotalAmount" ELSE 0 END) DESC
      LIMIT $${currentParamIndex}
    `, queryParams)

    console.log('✅ Top customers query executed successfully')
    console.log('📊 Query returned:', result.rows.length, 'rows')

    // Debug: Log query results
    console.log(`📊 Top customers query returned ${result.rows.length} rows`)
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
      uniqueProducts: 0, // Not available without joining tblTrxDetail
      avgOrderValue: Number(row.avgOrderValue) || 0,
      totalQuantity: 0, // Not available without joining tblTrxDetail
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
      source: 'postgresql-flat-table'
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

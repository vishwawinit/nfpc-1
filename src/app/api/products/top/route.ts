import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

/**
 * API Endpoint: GET /api/products/top
 * Description: Fetches top products by sales amount
 * Query Parameters:
 *   - limit: Number of products to return (default: 10)
 *   - range: Date range filter (thisMonth, lastMonth, thisQuarter, etc.)
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
    
    // Authentication removed - no user hierarchy filtering

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

    // Optimized date range filter for better performance
    conditions.push(`DATE(t.transaction_date) >= $${paramIndex}`)
    params.push(startDate)
    paramIndex++
    conditions.push(`DATE(t.transaction_date) <= $${paramIndex}`)
    params.push(endDate)
    paramIndex++

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

    // Log query details for debugging
    console.log('🔍 Top products query details:', {
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
    console.log('🔄 Using products query with date filters, limit:', limit)
    
    // Build final query with all filters
    console.log('🔄 Building top products query with filters')
    console.log('📊 Query conditions:', { whereClause, paramCount: params.length, limit })
    
    // Construct the final WHERE clause
    let finalConditions = []
    let queryParams = []
    let currentParamIndex = 1
    
    // Add date conditions if they exist
    if (startDate && endDate) {
      finalConditions.push(`DATE(t.transaction_date) >= $${currentParamIndex}`)
      queryParams.push(startDate)
      currentParamIndex++
      
      finalConditions.push(`DATE(t.transaction_date) <= $${currentParamIndex}`)
      queryParams.push(endDate)
      currentParamIndex++
    }
    
    // Add other filters
    if (regionCode) {
      finalConditions.push(`c.region_code = $${currentParamIndex}`)
      queryParams.push(regionCode)
      currentParamIndex++
    }
    
    if (cityCode) {
      finalConditions.push(`c.city_code = $${currentParamIndex}`)
      queryParams.push(cityCode)
      currentParamIndex++
    }
    
    if (userCode) {
      finalConditions.push(`t.user_code = $${currentParamIndex}`)
      queryParams.push(userCode)
      currentParamIndex++
    }
    
    if (storeCode) {
      finalConditions.push(`t.customer_code = $${currentParamIndex}`)
      queryParams.push(storeCode)
      currentParamIndex++
    }
    
    // Always include these base conditions
    finalConditions.push('t.product_code IS NOT NULL')
    finalConditions.push('COALESCE(t.quantity_bu, 0) != 0')
    
    const finalWhere = finalConditions.length > 0 ? `WHERE ${finalConditions.join(' AND ')}` : ''
    
    // Add limit parameter
    queryParams.push(limit)
    
    console.log('🎯 Final query conditions:', {
      finalWhere,
      queryParams: queryParams.map((p, i) => `$${i+1}: ${p}`)
    })
    
    const result = await query(`
      SELECT 
        t.product_code as "productCode",
        COALESCE(MAX(t.product_name), 'Unknown Product') as "productName",
        SUM(ABS(COALESCE(t.quantity_bu, 0))) as "quantitySold",
        COUNT(*) as "totalOrders",
        COUNT(DISTINCT t.customer_code) as "uniqueCustomers",
        MAX(t.transaction_date) as "lastSoldDate",
        COALESCE(MAX(t.currency_code), 'AED') as "currency",
        'Unknown' as "categoryName",
        'PCS' as "baseUom",
        COALESCE(SUM(ABS(COALESCE(t.net_amount, 0))), 0) as "salesAmount",
        CASE WHEN SUM(ABS(COALESCE(t.quantity_bu, 0))) > 0 
             THEN COALESCE(SUM(ABS(COALESCE(t.net_amount, 0))), 0) / SUM(ABS(COALESCE(t.quantity_bu, 0)))
             ELSE 0 END as "averagePrice"
      FROM flat_transactions t
      LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
      ${finalWhere}
      GROUP BY t.product_code
      ORDER BY SUM(ABS(COALESCE(t.quantity_bu, 0))) DESC 
      LIMIT $${currentParamIndex}
    `, queryParams)

    console.log('✅ Top products query executed successfully')
    console.log('📊 Query returned:', result.rows.length, 'rows')

    // Debug: Log query results
    console.log(`📦 Top products query returned ${result.rows.length} rows`)
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

    // Calculate cache duration
    const hasCustomDates = !!(customStartDate && customEndDate)
    const cacheDuration = getCacheDuration(dateRange, hasCustomDates)

    return NextResponse.json({
      success: true,
      data: topProducts,
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
        'Cache-Control': `public, s-maxage=${cacheDuration}, stale-while-revalidate=${cacheDuration * 2}`
      }
    })

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

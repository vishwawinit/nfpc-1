import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getCacheDuration, getCacheControlHeader } from '@/lib/cache-utils'

// Enable caching with revalidation
export const dynamic = 'auto'
export const revalidate = 300 // Fallback: 5 minutes

// Table name constant
const SALES_TABLE = 'flat_daily_sales_report'

/**
 * Build WHERE clause with filters for flat table
 */
const buildWhereClause = (filters: any, params: any[], startParamIndex: number = 1) => {
  const conditions: string[] = []
  let paramCount = startParamIndex

  // Date filters (always include if provided) - optimized to use indexes
  if (filters.startDate && filters.endDate) {
    conditions.push(`trx_trxdate >= $${paramCount}::timestamp`)
    params.push(filters.startDate)
    paramCount++
    conditions.push(`trx_trxdate < ($${paramCount}::timestamp + INTERVAL '1 day')`)
    params.push(filters.endDate)
    paramCount++
  }

  // Transaction type filter (1 = Sales)
  conditions.push(`trx_trxtype = 1`)

  // Area filter (support both old regionCode and new areaCode)
  if (filters.areaCode || filters.regionCode) {
    conditions.push(`route_areacode = $${paramCount}`)
    params.push(filters.areaCode || filters.regionCode)
    paramCount++
  }

  // Sub Area filter (support both old cityCode and new subAreaCode)
  if (filters.subAreaCode || filters.cityCode) {
    conditions.push(`route_subareacode = $${paramCount}`)
    params.push(filters.subAreaCode || filters.cityCode)
    paramCount++
  }

  // Team Leader filter (via route_salesmancode)
  if (filters.teamLeaderCode) {
    conditions.push(`route_salesmancode = $${paramCount}`)
    params.push(filters.teamLeaderCode)
    paramCount++
  }

  // Field User Role filter
  if (filters.fieldUserRole) {
    conditions.push(`user_usertype = $${paramCount}`)
    params.push(filters.fieldUserRole)
    paramCount++
  }

  // User Code filter
  if (filters.userCode) {
    conditions.push(`trx_usercode = $${paramCount}`)
    params.push(filters.userCode)
    paramCount++
  }

  // Chain Name filter (using customer_jdecustomertype)
  if (filters.chainName) {
    conditions.push(`customer_jdecustomertype = $${paramCount}`)
    params.push(filters.chainName)
    paramCount++
  }

  // Store Code filter
  if (filters.storeCode) {
    conditions.push(`customer_code = $${paramCount}`)
    params.push(filters.storeCode)
    paramCount++
  }

  // Product Code filter
  if (filters.productCode) {
    conditions.push(`line_itemcode = $${paramCount}`)
    params.push(filters.productCode)
    paramCount++
  }

  // Product Category filter
  if (filters.productCategory) {
    conditions.push(`item_grouplevel1 = $${paramCount}`)
    params.push(filters.productCategory)
    paramCount++
  }

  // Route Code filter
  if (filters.routeCode) {
    conditions.push(`trx_routecode = $${paramCount}`)
    params.push(filters.routeCode)
    paramCount++
  }

  // Channel Code filter (for filtering by specific channel)
  if (filters.channelCode) {
    conditions.push(`customer_channelcode = $${paramCount}`)
    params.push(filters.channelCode)
    paramCount++
  }

  return {
    whereClause: `WHERE ${conditions.join(' AND ')}`,
    paramCount
  }
}

/**
 * API Endpoint: GET /api/dashboard/sales-by-channel
 * Description: Fetches sales distribution by channel using customer_channelcode and customer_channel_description
 * Query Parameters:
 *   - startDate: Start date filter (format: YYYY-MM-DD)
 *   - endDate: End date filter (format: YYYY-MM-DD)
 *   - regionCode: Filter by region
 *   - cityCode: Filter by city
 *   - teamLeaderCode: Filter by team leader
 *   - fieldUserRole: Filter by field user role
 *   - userCode: Filter by field user
 *   - chainName: Filter by chain name
 *   - storeCode: Filter by store
 *   - productCode: Filter by product
 *   - productCategory: Filter by product category
 *   - routeCode: Filter by route
 * Returns: Array of channels with their sales and percentage contribution
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Build filters object - support both old (region/city) and new (area/subArea) parameter names
    const filters: any = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      areaCode: searchParams.get('areaCode') || undefined,
      subAreaCode: searchParams.get('subAreaCode') || undefined,
      regionCode: searchParams.get('regionCode') || undefined, // backward compatibility
      cityCode: searchParams.get('cityCode') || undefined, // backward compatibility
      teamLeaderCode: searchParams.get('teamLeaderCode') || undefined,
      fieldUserRole: searchParams.get('fieldUserRole') || undefined,
      userCode: searchParams.get('userCode') || undefined,
      chainName: searchParams.get('chainName') || undefined,
      storeCode: searchParams.get('storeCode') || undefined,
      productCode: searchParams.get('productCode') || undefined,
      productCategory: searchParams.get('productCategory') || undefined,
      routeCode: searchParams.get('routeCode') || undefined,
      channelCode: searchParams.get('channelCode') || undefined
    }

    const params: any[] = []
    const { whereClause } = buildWhereClause(filters, params)

    // Log for debugging
    console.log('Sales by channel query params:', {
      startDate: filters.startDate,
      endDate: filters.endDate,
      whereClause,
      params
    })

    // Fetch sales by channel using flat table with customer_channelcode and customer_channel_description
    const result = await query(`
      SELECT
        COALESCE(customer_channel_description, customer_channelcode, 'Unassigned') as channel,
        customer_channelcode as channel_code,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COUNT(DISTINCT trx_trxcode) as orders,
        COUNT(DISTINCT customer_code) as customers,
        COALESCE(AVG(NULLIF(trx_totalamount, 0)), 0) as avg_order_value,
        COALESCE(SUM(ABS(line_quantitybu)), 0) as total_quantity
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY customer_channelcode, customer_channel_description
      ORDER BY sales DESC
    `, params)

    // Calculate total sales for percentage
    const totalSales = result.rows.reduce((sum, row) => sum + parseFloat(row.sales || '0'), 0)

    const channelData = result.rows.map(row => {
      const sales = parseFloat(row.sales || '0')
      const percentage = totalSales > 0 ? ((sales / totalSales) * 100) : 0

      return {
        channel: row.channel,
        channelCode: row.channel_code || null,
        channelType: 'Channel',
        sales: parseFloat(sales.toFixed(2)),
        orders: parseInt(row.orders || '0'),
        customers: parseInt(row.customers || '0'),
        avgOrderValue: parseFloat(row.avg_order_value || '0'),
        totalQuantity: parseFloat(row.total_quantity || '0'),
        percentage: parseFloat(percentage.toFixed(2))
      }
    })

    // Determine cache duration based on date range
    const hasCustomDates = !!(filters.startDate && filters.endDate)
    const dateRangeType = hasCustomDates ? 'custom' : 'thisMonth'
    const cacheDuration = getCacheDuration(dateRangeType, hasCustomDates, filters.startDate, filters.endDate)

    return NextResponse.json({
      success: true,
      data: channelData,
      totalSales: parseFloat(totalSales.toFixed(2)),
      filters: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        areaCode: filters.areaCode || null,
        subAreaCode: filters.subAreaCode || null,
        regionCode: filters.regionCode || null,
        cityCode: filters.cityCode || null,
        teamLeaderCode: filters.teamLeaderCode || null,
        fieldUserRole: filters.fieldUserRole || null,
        userCode: filters.userCode || null,
        chainName: filters.chainName || null,
        storeCode: filters.storeCode || null,
        productCode: filters.productCode || null,
        productCategory: filters.productCategory || null,
        routeCode: filters.routeCode || null,
        channelCode: filters.channelCode || null
      },
      timestamp: new Date().toISOString(),
      cached: true,
      cacheInfo: {
        duration: cacheDuration,
        dateRange: dateRangeType
      },
      source: 'postgresql-flat-table'
    }, {
      headers: {
        'Cache-Control': getCacheControlHeader(cacheDuration)
      }
    })

  } catch (error) {
    console.error('Sales by channel API error:', error)
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch sales by channel',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: isDev ? error : undefined
    }, { status: 500 })
  }
}

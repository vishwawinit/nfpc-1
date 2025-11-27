import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Intelligent caching - longer cache for data with date filters (30 mins default)
const DEFAULT_CACHE_DURATION = 1800 // 30 minutes

/**
 * API Endpoint: GET /api/dashboard/sales-by-channel
 * Description: Fetches sales distribution by channel (chain_name)
 * Query Parameters:
 *   - startDate: Start date filter (format: YYYY-MM-DD)
 *   - endDate: End date filter (format: YYYY-MM-DD)
 *   - regionCode: Filter by region
 *   - teamLeaderCode: Filter by team leader
 *   - fieldUserRole: Filter by field user role
 *   - userCode: Filter by field user
 * Returns: Array of channels with their sales and percentage contribution
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Get date range - prioritize custom dates
    const startDate = customStartDate || null
    const endDate = customEndDate || null

    const conditions: string[] = []
    const params: any[] = []
    const joins: string[] = []
    let paramIndex = 1

    // Date filters - optimized for index usage (no DATE() function)
    if (startDate && endDate) {
      conditions.push(`t."TrxDate" >= $${paramIndex}::timestamp`)
      params.push(startDate)
      paramIndex++
      conditions.push(`t."TrxDate" < ($${paramIndex}::timestamp + INTERVAL '1 day')`)
      params.push(endDate)
      paramIndex++
    }

    // Only include invoices/sales (TrxType = 1)
    conditions.push(`t."TrxType" = 1`)

    // Region filter - use RegionCode from tblCustomer
    if (regionCode) {
      conditions.push(`c."RegionCode" = $${paramIndex}`)
      params.push(regionCode)
      paramIndex++
    }

    // City filter - use CityCode from tblCustomer
    if (cityCode) {
      conditions.push(`c."CityCode" = $${paramIndex}`)
      params.push(cityCode)
      paramIndex++
    }

    // Team Leader filter - use JOIN instead of EXISTS for better performance
    if (teamLeaderCode) {
      joins.push(`INNER JOIN "tblUser" u ON t."UserCode" = u."Code"`)
      conditions.push(`u."ReportsTo" = $${paramIndex}`)
      params.push(teamLeaderCode)
      paramIndex++
    }

    // Field User Role filter - not directly applicable
    // if (fieldUserRole) {
    //   conditions.push(`cd."UserCode" = $${paramIndex}`)
    //   params.push(fieldUserRole)
    //   paramIndex++
    // }

    // User filter
    if (userCode) {
      conditions.push(`t."UserCode" = $${paramIndex}`)
      params.push(userCode)
      paramIndex++
    }

    // Chain/Channel filter - using ChannelCode from tblCustomerDetail
    const chainName = searchParams.get('chainName')
    if (chainName) {
      conditions.push(`TRIM(cd."ChannelCode") = $${paramIndex}`)
      params.push(chainName)
      paramIndex++
    }

    // Store filter
    const storeCode = searchParams.get('storeCode')
    if (storeCode) {
      conditions.push(`t."ClientCode" = $${paramIndex}`)
      params.push(storeCode)
      paramIndex++
    }

    // Add TotalAmount filter
    conditions.push(`t."TotalAmount" IS NOT NULL`)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const additionalJoins = joins.length > 0 ? joins.join(' ') : ''

    // Log for debugging
    console.log('Sales by channel query params:', { startDate, endDate, conditions: conditions.length, whereClause, params })

    // Fetch sales by channel using tblTrxHeader -> tblCustomerDetail -> tblChannel
    // Channel is linked via tblCustomerDetail.ChannelCode -> tblChannel.Code
    // Also join tblCustomer for region filtering
    const result = await query(`
      SELECT
        COALESCE(ch."Description", TRIM(cd."ChannelCode"), 'Unassigned') as channel,
        TRIM(cd."ChannelCode") as channel_code,
        COALESCE(SUM(CASE WHEN t."TotalAmount" >= 0 THEN t."TotalAmount" ELSE 0 END), 0) as sales,
        COUNT(DISTINCT t."TrxCode") as orders,
        COUNT(DISTINCT t."ClientCode") as customers,
        AVG(t."TotalAmount") as avg_order_value,
        COALESCE(SUM(ABS(COALESCE(d."QuantityBU", 0))), 0) as total_quantity
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblCustomerDetail" cd ON t."ClientCode" = cd."CustomerCode"
      LEFT JOIN "tblChannel" ch ON TRIM(cd."ChannelCode") = ch."Code"
      LEFT JOIN "tblTrxDetail" d ON t."TrxCode" = d."TrxCode"
      ${additionalJoins}
      ${whereClause}
      GROUP BY TRIM(cd."ChannelCode"), ch."Description"
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

    return NextResponse.json({
      success: true,
      data: channelData,
      totalSales: parseFloat(totalSales.toFixed(2)),
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        regionCode: regionCode || null,
        teamLeaderCode: teamLeaderCode || null,
        fieldUserRole: fieldUserRole || null,
        userCode: userCode || null
      },
      timestamp: new Date().toISOString(),
      cached: true,
      cacheInfo: {
        duration: DEFAULT_CACHE_DURATION
      },
      source: 'postgresql-flat-table'
    }, {
      headers: {
        'Cache-Control': `public, s-maxage=${DEFAULT_CACHE_DURATION}, stale-while-revalidate=${DEFAULT_CACHE_DURATION * 2}`
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

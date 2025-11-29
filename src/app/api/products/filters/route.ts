import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const current = new Date()
  let startDate: Date = new Date(current)
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      startDate = new Date(current)
      endDate = new Date(current)
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
      endDate = new Date(current)
      break
    case 'last30Days':
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      endDate = new Date(current)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(current.getMonth() / 3)
      startDate = new Date(current.getFullYear(), quarter * 3, 1)
      endDate = new Date(current)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(current.getMonth() / 3) - 1
      startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      endDate = new Date(current)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
      endDate = new Date(current)
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeProducts = searchParams.get('includeProducts') === 'true'
    const dateRange = searchParams.get('range') || 'thisMonth'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')
    const channelFilter = searchParams.get('channel')

    // Get date range
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

    // Date conditions
    conditions.push(`trx_trxdate >= $${paramIndex}::date`)
    params.push(startDate)
    paramIndex++
    conditions.push(`trx_trxdate <= $${paramIndex}::date`)
    params.push(endDate)
    paramIndex++

    // Only include invoices/sales
    conditions.push(`trx_trxtype = 1`)

    // Channel filter (for products)
    const channelCondition = channelFilter ? `customer_channel_description = $${paramIndex}` : ''
    if (channelFilter) {
      params.push(channelFilter)
      paramIndex++
    }

    const baseWhereClause = `WHERE ${conditions.join(' AND ')}`
    const channelWhereClause = channelCondition
      ? `${baseWhereClause} AND ${channelCondition}`
      : baseWhereClause

    // Get unique channels from flat_daily_sales_report - OPTIMIZED with LIMIT
    const channelsQuery = `
      SELECT
        customer_channel_description as code,
        customer_channel_description as name
      FROM ${SALES_TABLE}
      ${baseWhereClause}
        AND customer_channel_description IS NOT NULL
        AND customer_channel_description != ''
      GROUP BY customer_channel_description
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `

    // Get top products by sales for search dropdown (optional, filtered by channel if selected)
    const productsQuery = includeProducts ? `
      SELECT
        line_itemcode as code,
        MAX(line_itemdescription) as name
      FROM ${SALES_TABLE}
      ${channelWhereClause}
        AND line_itemcode IS NOT NULL
        AND line_itemdescription IS NOT NULL
        AND line_itemdescription != ''
      GROUP BY line_itemcode
      ORDER BY SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) DESC
      LIMIT 200
    ` : null

    // Execute queries with appropriate params
    const baseParams = params.slice(0, 2) // Only date params for channels
    const channelParams = channelFilter ? params : baseParams // All params if channel filter is present

    const queries = [
      query(channelsQuery, baseParams)
    ]

    if (productsQuery) {
      queries.push(query(productsQuery, channelParams))
    }

    const results = await Promise.all(queries)
    const [channelsResult, productsResult] = results

    return NextResponse.json({
      success: true,
      data: {
        channels: channelsResult.rows,
        products: productsResult?.rows || []
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error) {
    console.error('Product filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product filters',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

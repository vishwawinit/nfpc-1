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
    const areaFilter = searchParams.get('areaCode')
    const subAreaFilter = searchParams.get('subAreaCode')
    const channelFilter = searchParams.get('channel')
    const brandFilter = searchParams.get('brand')

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

    // Area filter
    const areaCondition = areaFilter ? `route_areacode = $${paramIndex}` : ''
    if (areaFilter) {
      params.push(areaFilter)
      paramIndex++
    }

    // Sub-area filter
    const subAreaCondition = subAreaFilter ? `route_subareacode = $${paramIndex}` : ''
    if (subAreaFilter) {
      params.push(subAreaFilter)
      paramIndex++
    }

    // Channel filter (for products)
    const channelCondition = channelFilter ? `customer_channel_description = $${paramIndex}` : ''
    if (channelFilter) {
      params.push(channelFilter)
      paramIndex++
    }

    // Brand filter (for products)
    const brandCondition = brandFilter ? `item_brand_description = $${paramIndex}` : ''
    if (brandFilter) {
      params.push(brandFilter)
      paramIndex++
    }

    const baseWhereClause = `WHERE ${conditions.join(' AND ')}`

    // Build combined WHERE clause with additional filters
    const additionalFilters: string[] = []
    if (areaCondition) additionalFilters.push(areaCondition)
    if (subAreaCondition) additionalFilters.push(subAreaCondition)
    if (channelCondition) additionalFilters.push(channelCondition)
    if (brandCondition) additionalFilters.push(brandCondition)

    const channelWhereClause = additionalFilters.length > 0
      ? `${baseWhereClause} AND ${additionalFilters.join(' AND ')}`
      : baseWhereClause

    // Build WHERE clause excluding area filter for cascading (areas should show all available areas)
    const areaWhereClause = baseWhereClause + (channelCondition || brandCondition ?
      ` AND ${[channelCondition, brandCondition].filter(c => c).join(' AND ')}` : '')

    // Build WHERE clause excluding sub-area filter for cascading (sub-areas should be filtered by selected area)
    const subAreaWhereClause = baseWhereClause + (areaCondition || channelCondition || brandCondition ?
      ` AND ${[areaCondition, channelCondition, brandCondition].filter(c => c).join(' AND ')}` : '')

    // Get unique areas - OPTIMIZED with LIMIT
    const areasQuery = `
      SELECT
        route_areacode as code,
        route_areacode as name
      FROM ${SALES_TABLE}
      ${areaWhereClause}
        AND route_areacode IS NOT NULL
        AND route_areacode != ''
      GROUP BY route_areacode
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `

    // Get unique sub-areas - OPTIMIZED with LIMIT
    const subAreasQuery = `
      SELECT
        route_subareacode as code,
        route_subareacode as name
      FROM ${SALES_TABLE}
      ${subAreaWhereClause}
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
      GROUP BY route_subareacode
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `

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

    // Get unique brands from item_brand_description
    const brandsQuery = `
      SELECT
        item_brand_description as code,
        item_brand_description as name
      FROM ${SALES_TABLE}
      ${channelWhereClause}
        AND item_brand_description IS NOT NULL
        AND item_brand_description != ''
      GROUP BY item_brand_description
      ORDER BY SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) DESC
      LIMIT 100
    `

    // Execute queries with appropriate params
    const baseParams = params.slice(0, 2) // Only date params

    // Calculate params for each query based on which filters are applied
    const getParamsForQuery = (excludeFilters: string[] = []) => {
      const queryParams = [...baseParams]
      if (areaFilter && !excludeFilters.includes('area')) queryParams.push(areaFilter)
      if (subAreaFilter && !excludeFilters.includes('subArea')) queryParams.push(subAreaFilter)
      if (channelFilter && !excludeFilters.includes('channel')) queryParams.push(channelFilter)
      if (brandFilter && !excludeFilters.includes('brand')) queryParams.push(brandFilter)
      return queryParams
    }

    const queries = [
      query(areasQuery, getParamsForQuery(['area'])),
      query(subAreasQuery, getParamsForQuery(['subArea'])),
      query(channelsQuery, baseParams),
      query(brandsQuery, getParamsForQuery())
    ]

    if (productsQuery) {
      queries.push(query(productsQuery, getParamsForQuery()))
    }

    const results = await Promise.all(queries)
    const [areasResult, subAreasResult, channelsResult, brandsResult, productsResult] = results

    return NextResponse.json({
      success: true,
      data: {
        areas: areasResult.rows,
        subAreas: subAreasResult.rows,
        channels: channelsResult.rows,
        brands: brandsResult.rows,
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

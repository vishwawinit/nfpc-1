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
    console.log('📊 Products Analytics API - Starting request...')
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('range') || 'thisMonth'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')
    const channelFilter = searchParams.get('channel')
    const productCodeFilter = searchParams.get('productCode')

    console.log('📊 Products Analytics - Params:', {
      dateRange,
      customStartDate,
      customEndDate,
      channelFilter,
      productCodeFilter
    })

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

    // Date conditions - optimized for index usage
    conditions.push(`trx_trxdate >= $${paramIndex}::date`)
    params.push(startDate)
    paramIndex++
    conditions.push(`trx_trxdate <= $${paramIndex}::date`)
    params.push(endDate)
    paramIndex++

    // Only include invoices/sales (TrxType = 1)
    conditions.push(`trx_trxtype = 1`)

    // Channel filter
    if (channelFilter) {
      conditions.push(`customer_channel_description = $${paramIndex}`)
      params.push(channelFilter)
      paramIndex++
    }

    // Product code filter
    if (productCodeFilter) {
      conditions.push(`line_itemcode = $${paramIndex}`)
      params.push(productCodeFilter)
      paramIndex++
    }

    // Base conditions
    conditions.push('line_itemcode IS NOT NULL')
    conditions.push('COALESCE(line_quantitybu, 0) != 0')

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // OPTIMIZED QUERIES - Simpler aggregation without CTE for better performance
    const kpiQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as total_revenue,
        COUNT(DISTINCT trx_trxcode) as total_orders,
        COALESCE(SUM(ABS(COALESCE(line_quantitybu, 0))), 0) as total_quantity,
        COUNT(DISTINCT customer_code) as unique_customers,
        COUNT(DISTINCT line_itemcode) as unique_products,
        COALESCE(MAX(trx_currencycode), 'AED') as currency_code
      FROM ${SALES_TABLE}
      ${whereClause}
    `

    // Only fetch top 50 products for summary - much faster
    // Removed - we don't need product details for the summary tab anymore
    const productSummaryQuery = null

    // Channel analysis - Simple aggregation query
    const channelQuery = `
      SELECT
        COALESCE(customer_channel_description, 'Unknown Channel') as channel,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COUNT(DISTINCT line_itemcode) as products,
        COALESCE(SUM(ABS(COALESCE(line_quantitybu, 0))), 0) as quantity
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY customer_channel_description
      ORDER BY sales DESC
      LIMIT 10
    `

    // Brand distribution query using item_category_description
    const brandDistributionQuery = `
      SELECT
        COALESCE(item_category_description, 'Unknown Brand') as brand,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COUNT(DISTINCT line_itemcode) as products,
        COALESCE(SUM(ABS(COALESCE(line_quantitybu, 0))), 0) as quantity
      FROM ${SALES_TABLE}
      ${whereClause}
        AND item_category_description IS NOT NULL
        AND item_category_description != ''
      GROUP BY item_category_description
      ORDER BY sales DESC
      LIMIT 15
    `

    // Top 10 products by sales - optimized query
    const topProductsQuery = `
      SELECT
        line_itemcode as product_code,
        MAX(line_itemdescription) as product_name,
        COALESCE(MAX(item_grouplevel1), 'Uncategorized') as category,
        COALESCE(MAX(item_category_description), 'No Brand') as brand,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COALESCE(SUM(ABS(COALESCE(line_quantitybu, 0))), 0) as quantity,
        CASE
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0
          THEN SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) / SUM(ABS(COALESCE(line_quantitybu, 0)))
          ELSE 0
        END as avg_price,
        CASE
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 1000 THEN 'Fast'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 100 THEN 'Medium'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0 THEN 'Slow'
          ELSE 'No Sales'
        END as movement_status,
        COALESCE(MAX(trx_currencycode), 'AED') as currency_code
      FROM ${SALES_TABLE}
      ${whereClause}
        AND line_itemcode IS NOT NULL
      GROUP BY line_itemcode
      ORDER BY sales DESC
      LIMIT 10
    `

    // Movement status counts - counts products by sales velocity
    const movementStatusQuery = `
      SELECT
        COUNT(CASE WHEN total_quantity > 1000 THEN 1 END) as fast_moving,
        COUNT(CASE WHEN total_quantity > 0 AND total_quantity <= 100 THEN 1 END) as slow_moving,
        COUNT(CASE WHEN total_quantity = 0 THEN 1 END) as no_sales
      FROM (
        SELECT
          line_itemcode,
          SUM(ABS(COALESCE(line_quantitybu, 0))) as total_quantity
        FROM ${SALES_TABLE}
        ${whereClause}
          AND line_itemcode IS NOT NULL
        GROUP BY line_itemcode
      ) product_quantities
    `

    // Execute all queries in parallel for speed
    console.log('📊 Products Analytics - Executing queries in parallel...')
    const queryStart = Date.now()

    const [kpiResult, channelResult, brandResult, topProductsResult, movementResult] = await Promise.all([
      query(kpiQuery, params),
      query(channelQuery, params),
      query(brandDistributionQuery, params),
      query(topProductsQuery, params),
      query(movementStatusQuery, params)
    ])

    const queryDuration = Date.now() - queryStart
    console.log(`📊 Products Analytics - Queries completed in ${queryDuration}ms`)

    const kpiData = kpiResult.rows[0] || {}
    const salesByChannel = channelResult.rows.map((row: any) => ({
      channel: row.channel,
      sales: parseFloat(row.sales || '0'),
      products: parseInt(row.products || '0'),
      quantity: parseFloat(row.quantity || '0')
    }))

    // Brand distribution data
    const brandDistribution = brandResult.rows.map((row: any) => ({
      brand: row.brand,
      sales: parseFloat(row.sales || '0'),
      products: parseInt(row.products || '0'),
      quantity: parseFloat(row.quantity || '0')
    }))

    console.log(`📊 Products Analytics - Found ${brandDistribution.length} brands`)

    // Top products data
    const topProductsData = topProductsResult.rows.map((row: any) => ({
      productCode: row.product_code,
      productName: row.product_name || 'Unnamed Product',
      category: row.category,
      brand: row.brand,
      sales: parseFloat(row.sales || '0'),
      quantity: parseFloat(row.quantity || '0'),
      avgPrice: parseFloat(row.avg_price || '0'),
      movementStatus: row.movement_status,
      currencyCode: row.currency_code || 'AED'
    }))

    console.log(`📊 Products Analytics - Found ${topProductsData.length} top products`)

    // Movement status data
    const movementData = movementResult.rows[0] || {}
    const fastMovingCount = parseInt(movementData.fast_moving || '0')
    const slowMovingCount = parseInt(movementData.slow_moving || '0')
    const noSalesCount = parseInt(movementData.no_sales || '0')

    console.log(`📊 Products Analytics - Movement Status: Fast=${fastMovingCount}, Slow=${slowMovingCount}, NoSales=${noSalesCount}`)

    // Calculate overall metrics from KPI query
    const totalRevenue = parseFloat(kpiData.total_revenue || '0')
    const totalOrders = parseInt(kpiData.total_orders || '0')
    const totalQuantity = parseFloat(kpiData.total_quantity || '0')
    const uniqueCustomers = parseInt(kpiData.unique_customers || '0')
    const uniqueProducts = parseInt(kpiData.unique_products || '0')
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Product-level metrics from KPI query
    const totalProducts = uniqueProducts
    const activeProducts = uniqueProducts
    const totalSales = totalRevenue
    const fastMoving = fastMovingCount
    const slowMoving = slowMovingCount
    const noSales = noSalesCount

    // Helper function to check if value is valid
    const isValidValue = (value: string | null | undefined): boolean => {
      if (!value) return false
      const normalized = value.trim().toLowerCase()
      return normalized !== '' &&
             normalized !== 'unknown' &&
             normalized !== 'n/a' &&
             normalized !== 'null' &&
             normalized !== 'na' &&
             normalized !== 'uncategorized'
    }

    // Brand distribution with percentages (using item_category_description)
    const brandSalesDistribution = brandDistribution.map(brand => ({
      brand: brand.brand,
      sales: brand.sales,
      products: brand.products,
      quantity: brand.quantity,
      percentage: totalSales > 0 ? (brand.sales / totalSales * 100) : 0
    }))

    const data = {
      metrics: {
        // Comprehensive KPIs
        totalRevenue,
        totalOrders,
        totalQuantity,
        uniqueCustomers,
        uniqueProducts,
        avgOrderValue,

        // Product-specific metrics
        totalProducts,
        activeProducts,
        totalSales,
        fastMoving,
        slowMoving,
        noSales,
        currencyCode: kpiData.currency_code || 'AED'
      },
      salesByChannel,
      brandSalesDistribution,
      topProducts: topProductsData
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error) {
    console.error('Product analytics API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

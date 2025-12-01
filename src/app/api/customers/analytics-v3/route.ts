import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

/**
 * For flat_daily_sales_report, we don't need a separate customer table
 * All customer data is denormalized in the flat table
 */
const SALES_TABLE = 'flat_daily_sales_report'

// Helper to convert Date to YYYY-MM-DD string in local timezone
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Intelligent caching based on date range
function getCacheDuration(dateRange: string, hasCustomDates: boolean): number {
  if (hasCustomDates) return 900 // 15 minutes for custom dates

  switch(dateRange) {
    case 'today':
      return 300 // 5 minutes
    case 'yesterday':
      return 600 // 10 minutes
    case 'thisWeek':
      return 900 // 15 minutes
    case 'thisMonth':
      return 1800 // 30 minutes
    case 'lastMonth':
    case 'thisQuarter':
    case 'lastQuarter':
      return 3600 // 60 minutes - historical data
    default:
      return 900
  }
}

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
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
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastMonth':
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(month / 3)
      startDate = new Date(year, quarter * 3, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(month / 3) - 1
      startDate = new Date(year, lastQuarter * 3, 1)
      endDate = new Date(year, lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
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

  // Date conditions
  if (params.startDate) {
    conditions.push(`trx_trxdate >= '${params.startDate}'::timestamp`)
  }
  if (params.endDate) {
    conditions.push(`trx_trxdate < ('${params.endDate}'::timestamp + INTERVAL '1 day')`)
  }

  // Geographic filters
  if (params.region) {
    conditions.push(`route_areacode = '${params.region}'`)
  }
  if (params.city) {
    conditions.push(`route_subareacode = '${params.city}'`)
  }

  // User filters
  if (params.userCode) {
    conditions.push(`trx_usercode = '${params.userCode}'`)
  }
  if (params.teamLeader) {
    conditions.push(`route_salesmancode = '${params.teamLeader}'`)
  }

  // Customer filters
  if (params.customer) {
    conditions.push(`customer_code = '${params.customer}'`)
  }
  if (params.chain) {
    conditions.push(`customer_channel_description = '${params.chain}'`)
  }

  // Product category filter
  if (params.category) {
    conditions.push(`item_grouplevel1 = '${params.category}'`)
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Check cache first
    const cachedData = apiCache.get('/api/customers/analytics-v3', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const dateRange = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const customer = searchParams.get('customer')
    const region = searchParams.get('region')
    const city = searchParams.get('city')
    const chain = searchParams.get('chain')
    const salesman = searchParams.get('salesman')
    const teamLeader = searchParams.get('teamLeader')
    const category = searchParams.get('category')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get date range - prioritize custom dates
    let startDate: string, endDate: string
    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const dateRangeResult = getDateRangeFromString(dateRange)
      startDate = dateRangeResult.startDate
      endDate = dateRangeResult.endDate
    }

    const filterParams = {
      startDate,
      endDate,
      region,
      city,
      teamLeader,
      userCode: salesman,
      chain,
      customer,
      category
    }

    const whereClause = buildWhereClause(filterParams)

    console.log('🔍 Customer analytics query details:', {
      startDate,
      endDate,
      filters: { region, city, chain, salesman, teamLeader, category },
      whereClause
    })

    // Get overall metrics
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT customer_code) as total_customers,
        COUNT(DISTINCT CASE WHEN trx_trxdate >= CURRENT_DATE - INTERVAL '30 days' THEN customer_code END) as active_customers,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as total_sales,
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as total_orders,
        CASE
          WHEN COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) > 0
          THEN COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) / COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END)
          ELSE 0
        END as avg_order_value
      FROM ${SALES_TABLE}
      ${whereClause}
    `

    console.log('📊 Executing metrics query...')
    const metricsResult = await query(metricsQuery)
    const rawMetrics = metricsResult.rows[0] || {}

    const metrics = {
      totalCustomers: parseInt(rawMetrics.total_customers || '0'),
      activeCustomers: parseInt(rawMetrics.active_customers || '0'),
      totalSales: parseFloat(rawMetrics.total_sales || '0'),
      totalOrders: parseInt(rawMetrics.total_orders || '0'),
      avgOrderValue: parseFloat(rawMetrics.avg_order_value || '0'),
      currencyCode: 'AED'
    }

    console.log('✅ Metrics:', metrics)

    // Sales by Brand (using item_brand_description)
    const salesByBrandQuery = `
      SELECT
        COALESCE(item_brand_description, 'Unknown') as brand,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as sales,
        COUNT(DISTINCT customer_code) as customer_count,
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as order_count,
        COUNT(DISTINCT line_itemcode) as product_count
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY item_brand_description
      ORDER BY sales DESC
      LIMIT 10
    `

    const brandResult = await query(salesByBrandQuery)
    const salesByBrand = brandResult.rows.map(row => ({
      brand: row.brand || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0'),
      productCount: parseInt(row.product_count || '0')
    }))

    // Sales by City (using route_subareacode as city)
    const salesByCityQuery = `
      SELECT
        COALESCE(route_subareacode, 'Unknown') as city,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as sales,
        COUNT(DISTINCT customer_code) as customer_count,
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as order_count
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY route_subareacode
      ORDER BY sales DESC
      LIMIT 10
    `

    const cityResult = await query(salesByCityQuery)
    const salesByCity = cityResult.rows.map(row => ({
      city: row.city || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0')
    }))

    // Sales by Product Category
    const salesByCategoryQuery = `
      SELECT
        COALESCE(item_grouplevel1, 'Others') as category,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as sales,
        COUNT(DISTINCT line_itemcode) as product_count,
        SUM(ABS(line_quantitybu)) as units_sold
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY item_grouplevel1
      ORDER BY sales DESC
      LIMIT 10
    `

    const categoryResult = await query(salesByCategoryQuery)
    const salesByCategory = categoryResult.rows.map(row => ({
      name: row.category || 'Others',
      value: parseFloat(row.sales || '0'),
      productCount: parseInt(row.product_count || '0'),
      unitsSold: parseInt(row.units_sold || '0')
    }))

    // Get top customers with pagination
    const offset = (page - 1) * limit

    const customersQuery = `
      WITH customer_data AS (
        SELECT
          customer_code,
          COALESCE(MAX(customer_description), customer_code) as customer_name,
          COALESCE(MAX(route_areacode), 'Unknown') as region_name,
          COALESCE(MAX(route_subareacode), 'Unknown') as city_name,
          COALESCE(MAX(customer_channel_description), 'Unknown') as chain_name,
          COALESCE(MAX(trx_routecode), '') as route_code,
          COALESCE(MAX(trx_usercode), '') as salesman_code,
          COALESCE(MAX(trx_usercode), 'Unknown') as salesman_name,
          COALESCE(MAX(route_salesmancode), '') as tl_code,
          COALESCE(MAX(route_salesmancode), 'Unknown') as tl_name,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
          COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as order_count,
          SUM(ABS(line_quantitybu)) as total_quantity,
          AVG(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as avg_order_value,
          MAX(trx_trxdate) as last_order_date,
          CURRENT_DATE - MAX(trx_trxdate::date) as days_since_last_order
        FROM ${SALES_TABLE}
        ${whereClause}
        GROUP BY customer_code
      ),
      counted AS (
        SELECT COUNT(*) as total_count FROM customer_data
      )
      SELECT
        customer_data.*,
        counted.total_count
      FROM customer_data
      CROSS JOIN counted
      ORDER BY customer_data.total_sales DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    console.log('🔍 Executing customers query...')
    const customersResult = await query(customersQuery)
    const totalCount = customersResult.rows[0]?.total_count || 0
    const totalPages = Math.ceil(totalCount / limit)

    const topCustomers = customersResult.rows.map(row => ({
      customerCode: row.customer_code,
      customerName: row.customer_name || 'Unknown',
      region: row.region_name || 'Unknown',
      city: row.city_name || 'Unknown',
      chain: row.chain_name || 'Unknown',
      routeCode: row.route_code || '',
      salesmanCode: row.salesman_code || '',
      salesmanName: row.salesman_name || 'Unknown',
      tlCode: row.tl_code || '',
      tlName: row.tl_name || 'Unknown',
      totalSales: parseFloat(row.total_sales || '0'),
      orderCount: parseInt(row.order_count || '0'),
      totalQuantity: parseFloat(row.total_quantity || '0'),
      avgOrderValue: parseFloat(row.avg_order_value || '0'),
      lastOrderDate: row.last_order_date,
      daysSinceLastOrder: parseInt(row.days_since_last_order || '0')
    }))

    console.log('✅ Found', topCustomers.length, 'customers')

    // Calculate cache duration
    const hasCustomDates = !!(startDateParam && endDateParam)
    const cacheDuration = getCacheDuration(dateRange, hasCustomDates)

    const responseData = {
      metrics,
      salesByBrand,
      salesByCity,
      salesByCategory,
      topCustomers,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        showing: totalCount > 0
          ? `${Math.min((page - 1) * limit + 1, totalCount)} to ${Math.min(page * limit, totalCount)} of ${totalCount}`
          : '0 to 0 of 0'
      }
    }

    const finalResponse = {
      success: true,
      data: responseData,
      dateRange: {
        start: startDate,
        end: endDate,
        label: dateRange
      },
      cached: true,
      cacheInfo: {
        duration: cacheDuration,
        dateRange,
        hasCustomDates
      }
    }

    // Store in cache
    apiCache.set('/api/customers/analytics-v3', finalResponse, searchParams)

    return NextResponse.json(finalResponse, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheDuration}, stale-while-revalidate=${cacheDuration * 2}`
      }
    })

  } catch (error) {
    console.error('❌ Customer analytics V3 API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      url: request.url
    })
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}


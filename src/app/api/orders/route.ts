import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'
export const revalidate = false // Use manual caching

// Date range helper
function getDateRange(rangeStr: string) {
  const now = new Date()
  let startDate: Date, endDate: Date

  switch (rangeStr) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.setHours(23, 59, 59, 999))
      break
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      startDate = new Date(yesterday.setHours(0, 0, 0, 0))
      endDate = new Date(yesterday.setHours(23, 59, 59, 999))
      break
    case 'thisWeek':
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      startDate = new Date(weekStart.setHours(0, 0, 0, 0))
      endDate = new Date(now)
      break
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
      break
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
      endDate = new Date(now)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1
      startDate = new Date(now.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(now.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
  }

  return {
    startStr: startDate.toISOString().split('T')[0],
    endStr: endDate.toISOString().split('T')[0]
  }
}

// Build parameterized WHERE clause
function buildWhereClause(params: {
  startDate: string
  endDate: string
  area?: string | null
  subArea?: string | null
  teamLeader?: string | null
  fieldUserRole?: string | null
  fieldUser?: string | null
  channel?: string | null
  customer?: string | null
  category?: string | null
  search?: string | null
}) {
  const conditions: string[] = ['trx_trxtype = $1']
  const values: any[] = [1] // trx_trxtype = 1
  let paramIndex = 2

  // Date range
  conditions.push(`trx_trxdate >= $${paramIndex}::timestamp`)
  values.push(`${params.startDate} 00:00:00`)
  paramIndex++

  conditions.push(`trx_trxdate < ($${paramIndex}::date + INTERVAL '1 day')`)
  values.push(params.endDate)
  paramIndex++

  // Hierarchical filters
  if (params.area && params.area !== 'all') {
    conditions.push(`route_areacode = $${paramIndex}`)
    values.push(params.area)
    paramIndex++
  }
  if (params.subArea && params.subArea !== 'all') {
    conditions.push(`route_subareacode = $${paramIndex}`)
    values.push(params.subArea)
    paramIndex++
  }
  if (params.teamLeader && params.teamLeader !== 'all') {
    conditions.push(`route_salesmancode = $${paramIndex}`)
    values.push(params.teamLeader)
    paramIndex++
  }
  if (params.fieldUserRole && params.fieldUserRole !== 'all') {
    conditions.push(`user_usertype = $${paramIndex}`)
    values.push(params.fieldUserRole)
    paramIndex++
  }
  if (params.fieldUser && params.fieldUser !== 'all') {
    conditions.push(`trx_usercode = $${paramIndex}`)
    values.push(params.fieldUser)
    paramIndex++
  }
  if (params.channel && params.channel !== 'all') {
    conditions.push(`customer_channelcode = $${paramIndex}`)
    values.push(params.channel)
    paramIndex++
  }
  if (params.customer && params.customer !== 'all') {
    conditions.push(`customer_code = $${paramIndex}`)
    values.push(params.customer)
    paramIndex++
  }
  if (params.category && params.category !== 'all') {
    conditions.push(`item_category_description = $${paramIndex}`)
    values.push(params.category)
    paramIndex++
  }
  if (params.search) {
    conditions.push(`(
      customer_code ILIKE $${paramIndex} OR
      customer_description ILIKE $${paramIndex} OR
      trx_trxcode ILIKE $${paramIndex}
    )`)
    values.push(`%${params.search}%`)
    paramIndex++
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Initialize database connection with better error handling
    try {
      await db.initialize()
    } catch (dbError) {
      console.error('Database initialization failed:', dbError)
      return NextResponse.json({
        success: false,
        error: 'Database connection failed. Please check if you are connected to VPN or if the database server is accessible.',
        details: dbError instanceof Error ? dbError.message : 'Unknown database error'
      }, { status: 503 })
    }

    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Hierarchical filters
    const areaFilter = searchParams.get('area')
    const subAreaFilter = searchParams.get('subArea')
    const teamLeaderFilter = searchParams.get('teamLeader')
    const fieldUserRoleFilter = searchParams.get('fieldUserRole')
    const fieldUserFilter = searchParams.get('fieldUser')
    const channelFilter = searchParams.get('channel')
    const customerFilter = searchParams.get('customer')
    const categoryFilter = searchParams.get('category')
    const searchQuery = searchParams.get('search')

    let startDate: string, endDate: string

    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const dateResult = getDateRange(range)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
    }

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/orders', searchParams)
    if (cachedData) {
      console.log(`Orders API cache hit (${Date.now() - startTime}ms)`)
      return NextResponse.json({
        ...cachedData,
        cached: true
      })
    }

    // Build WHERE clause with parameterized queries
    const { whereClause, values } = buildWhereClause({
      startDate,
      endDate,
      area: areaFilter,
      subArea: subAreaFilter,
      teamLeader: teamLeaderFilter,
      fieldUserRole: fieldUserRoleFilter,
      fieldUser: fieldUserFilter,
      channel: channelFilter,
      customer: customerFilter,
      category: categoryFilter,
      search: searchQuery
    })

    // OPTIMIZATION: Use a single CTE query for metrics, count, and base data
    // This reduces table scans from multiple queries to just one
    const combinedQuery = `
      WITH base_data AS (
        SELECT
          trx_trxcode,
          trx_trxdate,
          customer_code,
          customer_description,
          route_areacode,
          route_subareacode,
          region_description,
          customer_regioncode,
          city_description,
          customer_citycode,
          customer_channel_description,
          customer_channelcode,
          user_description,
          trx_usercode,
          route_salesmancode,
          user_usertype,
          line_itemcode,
          line_itemdescription,
          item_description,
          item_grouplevel1,
          line_quantitybu,
          line_baseprice,
          trx_totalamount
        FROM flat_daily_sales_report
        ${whereClause}
      ),
      metrics AS (
        SELECT
          COUNT(DISTINCT trx_trxcode) as total_orders,
          COUNT(DISTINCT customer_code) as total_customers,
          COUNT(DISTINCT line_itemcode) as total_products,
          COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as total_sales,
          COALESCE(AVG(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as avg_order_value,
          COALESCE(SUM(ABS(line_quantitybu)), 0) as total_quantity
        FROM base_data
      ),
      order_count AS (
        SELECT COUNT(DISTINCT trx_trxcode) as total FROM base_data
      )
      SELECT
        (SELECT row_to_json(metrics.*) FROM metrics) as metrics,
        (SELECT total FROM order_count) as total_count
    `

    // OPTIMIZATION: Run all independent queries in parallel
    const [combinedResult, ordersResult, chartsResults] = await Promise.all([
      // Get metrics and count in one query
      query(combinedQuery, values),

      // Get paginated orders
      query(`
        SELECT
          trx_trxcode as "orderCode",
          DATE(trx_trxdate) as "orderDate",
          customer_code as "customerCode",
          COALESCE(customer_description, 'Unknown') as "customerName",
          COALESCE(route_areacode, 'Unknown') as "area",
          COALESCE(route_subareacode, 'Unknown') as "subArea",
          COALESCE(region_description, customer_regioncode, 'Unknown') as "region",
          COALESCE(city_description, customer_citycode, 'Unknown') as "city",
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as "chain",
          COALESCE(user_description, trx_usercode, 'Unknown') as "salesman",
          trx_usercode as "salesmanCode",
          COALESCE(route_salesmancode, '') as "teamLeaderCode",
          COALESCE(route_salesmancode, '') as "teamLeader",
          COALESCE(user_usertype, 'Unknown') as "fieldUserRole",
          COUNT(DISTINCT line_itemcode) as "itemCount",
          COALESCE(SUM(ABS(line_quantitybu)), 0) as "totalQuantity",
          COALESCE(MAX(trx_totalamount), 0) as "orderTotal"
        FROM flat_daily_sales_report
        ${whereClause}
        GROUP BY
          trx_trxcode,
          DATE(trx_trxdate),
          customer_code,
          customer_description,
          route_areacode,
          route_subareacode,
          region_description,
          customer_regioncode,
          city_description,
          customer_citycode,
          customer_channel_description,
          customer_channelcode,
          user_description,
          trx_usercode,
          route_salesmancode,
          user_usertype
        ORDER BY DATE(trx_trxdate) DESC, trx_trxcode DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `, [...values, limit, offset]),

      // Get all chart data in parallel
      Promise.all([
        // Area-wise (using route_subareacode)
        query(`
          SELECT
            COALESCE(route_subareacode, 'Unknown') as "area",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(COALESCE(trx_totalamount, 0)) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY route_subareacode
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Region-wise (using route_areacode as parent region)
        query(`
          SELECT
            COALESCE(route_areacode, 'Unknown') as "subArea",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(COALESCE(trx_totalamount, 0)) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY route_areacode
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Region-wise
        query(`
          SELECT
            COALESCE(region_description, customer_regioncode, 'Unknown') as "region",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(COALESCE(trx_totalamount, 0)) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY region_description, customer_regioncode
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Chain-wise
        query(`
          SELECT
            COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as "chain",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(COALESCE(trx_totalamount, 0)) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY customer_channel_description, customer_channelcode
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Top customers by sales
        query(`
          SELECT
            customer_code as "customerCode",
            MAX(COALESCE(customer_description, 'Unknown')) as "customerName",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(COALESCE(trx_totalamount, 0)) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY customer_code
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Top products
        query(`
          SELECT
            line_itemcode as "productCode",
            MAX(COALESCE(line_itemdescription, item_description)) as "productName",
            COALESCE(MAX(item_grouplevel1), 'N/A') as "category",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(ABS(COALESCE(line_quantitybu, 0))) as "totalQuantity",
            SUM(CASE WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu) ELSE 0 END) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
            AND line_itemcode IS NOT NULL
          GROUP BY line_itemcode
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values),

        // Category-wise (using item_category_description)
        query(`
          SELECT
            COALESCE(item_category_description, 'Uncategorized') as "category",
            COUNT(DISTINCT trx_trxcode) as "orderCount",
            SUM(ABS(COALESCE(line_quantitybu, 0))) as "totalQuantity",
            SUM(CASE WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu) ELSE 0 END) as "totalSales"
          FROM flat_daily_sales_report
          ${whereClause}
          GROUP BY item_category_description
          HAVING SUM(CASE WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu) ELSE 0 END) > 0
          ORDER BY "totalSales" DESC
          LIMIT 10
        `, values)
      ])
    ])

    const metrics = combinedResult.rows[0].metrics
    const totalOrders = parseInt(combinedResult.rows[0].total_count || '0')

    const [areaWise, subAreaWise, regionWise, chainWise, topCustomers, topProducts, categoryWise] = chartsResults

    const responseData = {
      success: true,
      data: {
        orders: ordersResult.rows,
        metrics: {
          totalOrders: parseInt(metrics.total_orders || '0'),
          totalCustomers: parseInt(metrics.total_customers || '0'),
          totalProducts: parseInt(metrics.total_products || '0'),
          totalSales: parseFloat(metrics.total_sales || '0'),
          avgOrderValue: parseFloat(metrics.avg_order_value || '0'),
          totalQuantity: parseInt(metrics.total_quantity || '0')
        },
        charts: {
          areaWise: areaWise.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          subAreaWise: subAreaWise.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          regionWise: regionWise.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          chainWise: chainWise.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          topCustomers: topCustomers.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          topProducts: topProducts.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalQuantity: parseFloat(row.totalQuantity || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          })),
          categoryWise: categoryWise.rows.map((row: any) => ({
            ...row,
            orderCount: parseInt(row.orderCount || '0'),
            totalQuantity: parseFloat(row.totalQuantity || '0'),
            totalSales: parseFloat(row.totalSales || '0')
          }))
        },
        pagination: {
          page,
          limit,
          total: totalOrders,
          totalPages: Math.ceil(totalOrders / limit),
          hasNextPage: page < Math.ceil(totalOrders / limit),
          hasPrevPage: page > 1,
          showing: `${offset + 1}-${Math.min(offset + limit, totalOrders)} of ${totalOrders} orders`
        }
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: range
      },
      queryTime: Date.now() - startTime,
      cached: false
    }

    // Store in cache
    apiCache.set('/api/orders', searchParams, responseData)

    console.log(`Orders API query completed in ${Date.now() - startTime}ms`)

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Orders API error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      queryTime: Date.now() - startTime
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Intelligent caching based on date range
function getCacheDuration(dateRange: string, hasCustomDates: boolean): number {
  if (hasCustomDates) return 900 // 15 minutes for custom dates
  
  switch(dateRange) {
    case 'today':
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
    endStr: endDate.toISOString().split('T')[0],
    label: rangeStr
  }
}

// Helper to get column-safe expressions
function getCustomerColumnExpressions(columns: Set<string>) {
  const has = (column: string) => columns.has(column)

  return {
    storeCode: has('store_code') ? 'store_code' : 'customer_code',
    storeName: has('store_name') ? 'store_name' : 'NULL',
    regionCode: has('region_code') ? 'region_code' : 'NULL',
    regionName: has('region_name') ? 'region_name' : 'NULL',
    cityCode: has('city_code') ? 'city_code' : 'NULL',
    cityName: has('city_name') ? 'city_name' : 'NULL',
    chainCode: has('chain_code') ? 'chain_code' : 'NULL',
    chainName: has('chain_name') ? 'chain_name' : 'NULL',
    tlCode: has('tl_code') ? 'tl_code' : 'NULL',
    tlName: has('tl_name') ? 'tl_name' : 'NULL',
    fieldUserCode: has('field_user_code')
      ? 'field_user_code'
      : has('user_code')
        ? 'user_code'
        : 'NULL',
    fieldUserName: has('field_user_name') ? 'field_user_name' : 'NULL',
    trxCode: has('trx_code') ? 'trx_code' : 'transaction_code',
    trxDateOnly: has('trx_date_only') ? 'trx_date_only' : 'DATE(transaction_date)',
    trxType: has('trx_type') ? 'trx_type' : has('transaction_type') ? 'transaction_type' : '5',
    netAmount: has('net_amount')
      ? 'net_amount'
      : has('line_amount')
        ? 'line_amount'
        : '0',
    quantity: has('quantity_bu')
      ? 'quantity_bu'
      : has('quantity')
        ? 'quantity'
        : '0',
    productGroup: has('product_group_level1') ? 'product_group_level1' : has('product_group') ? 'product_group' : 'NULL',
    productCode: has('product_code') ? 'product_code' : 'NULL',
    routeCode: has('user_route_code') ? 'user_route_code' : 'NULL'
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
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
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const loginUserCode = searchParams.get('loginUserCode')
    
    // Get hierarchy-based allowed users
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
    }
    
    // Handle custom date range vs preset range
    let startDate: string
    let endDate: string
    let label: string
    
    if (startDateParam && endDateParam) {
      // Custom date range
      startDate = startDateParam
      endDate = endDateParam
      label = 'custom'
    } else {
      // Preset date range
      const dateResult = getDateRange(dateRange)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
      label = dateResult.label
    }
    
    await db.initialize()
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getCustomerColumnExpressions(tableInfo.columns)

    // Build WHERE clause
    let whereConditions: string[] = [
      `${col.trxType} = 5`,  // Sales Orders
      `${col.trxDateOnly} >= '${startDate}'`,
      `${col.trxDateOnly} <= '${endDate}'`
    ]
    
    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      whereConditions.push(`${col.fieldUserCode} IN (${userCodesStr})`)
    }

    if (customer) {
      whereConditions.push(`${col.storeCode} = '${customer}'`)
    }
    
    if (region) {
      whereConditions.push(`${col.regionCode} = '${region}'`)
    }
    
    if (city) {
      whereConditions.push(`${col.cityCode} = '${city}'`)
    }
    
    if (chain) {
      whereConditions.push(`${col.chainCode} = '${chain}'`)
    }
    
    if (salesman) {
      whereConditions.push(`${col.fieldUserCode} = '${salesman}'`)
    }
    
    if (teamLeader) {
      whereConditions.push(`${col.tlCode} = '${teamLeader}'`)
    }
    
    if (category) {
      whereConditions.push(`${col.productGroup} = '${category}'`)
    }
    
    if (search) {
      whereConditions.push(`(
        LOWER(${col.storeCode}) LIKE LOWER('%${search}%') OR 
        LOWER(COALESCE(${col.storeName}, '')) LIKE LOWER('%${search}%')
      )`)
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`

    // Get overall metrics
    const metricsQuery = `
      WITH customer_data AS (
        SELECT
          ${col.storeCode} as store_code,
          ${col.storeName} as store_name,
          SUM(${col.netAmount}) as total_sales,
          COUNT(DISTINCT ${col.trxCode}) as order_count,
          MAX(${col.trxDateOnly}) as last_order_date
        FROM ${transactionsTable}
        ${whereClause}
        GROUP BY ${col.storeCode}, ${col.storeName}
      )
      SELECT
        COUNT(DISTINCT store_code) as total_customers,
        COUNT(DISTINCT CASE WHEN last_order_date >= CURRENT_DATE - INTERVAL '30 days' THEN store_code END) as active_customers,
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(order_count), 0) as total_orders,
        CASE 
          WHEN SUM(order_count) > 0 THEN SUM(total_sales) / SUM(order_count)
          ELSE 0
        END as avg_order_value
      FROM customer_data
    `
    
    const metricsResult = await query(metricsQuery, [])
    const metrics = {
      totalCustomers: parseInt(metricsResult.rows[0]?.total_customers || '0'),
      activeCustomers: parseInt(metricsResult.rows[0]?.active_customers || '0'),
      totalSales: parseFloat(metricsResult.rows[0]?.total_sales || '0'),
      totalOrders: parseInt(metricsResult.rows[0]?.total_orders || '0'),
      avgOrderValue: parseFloat(metricsResult.rows[0]?.avg_order_value || '0'),
      currencyCode: 'INR'
    }

    // Sales by Region
    const salesByRegionQuery = `
      SELECT
        ${col.regionCode} as region_code,
        COALESCE(${col.regionName}, ${col.regionCode}) as region,
        SUM(${col.netAmount}) as sales,
        COUNT(DISTINCT ${col.storeCode}) as customer_count,
        COUNT(DISTINCT ${col.trxCode}) as order_count
      FROM ${transactionsTable}
      ${whereClause}
      GROUP BY ${col.regionCode}, ${col.regionName}
      ORDER BY sales DESC
      LIMIT 10
    `
    
    const regionResult = await query(salesByRegionQuery, [])
    const salesByRegion = regionResult.rows.map(row => ({
      region: row.region || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0')
    }))

    // Sales by City
    const salesByCityQuery = `
      SELECT
        ${col.cityCode} as city_code,
        COALESCE(${col.cityName}, ${col.cityCode}) as city,
        SUM(${col.netAmount}) as sales,
        COUNT(DISTINCT ${col.storeCode}) as customer_count,
        COUNT(DISTINCT ${col.trxCode}) as order_count
      FROM ${transactionsTable}
      ${whereClause}
      GROUP BY ${col.cityCode}, ${col.cityName}
      ORDER BY sales DESC
      LIMIT 10
    `
    
    const cityResult = await query(salesByCityQuery, [])
    const salesByCity = cityResult.rows.map(row => ({
      city: row.city || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0')
    }))

    // Sales by Product Category
    const salesByCategoryQuery = `
      SELECT
        COALESCE(${col.productGroup}, 'Others') as category,
        SUM(${col.netAmount}) as sales,
        COUNT(DISTINCT ${col.productCode}) as product_count,
        SUM(${col.quantity}) as units_sold
      FROM ${transactionsTable}
      ${whereClause}
      GROUP BY ${col.productGroup}
      ORDER BY sales DESC
      LIMIT 10
    `
    
    const categoryResult = await query(salesByCategoryQuery, [])
    const salesByCategory = categoryResult.rows.map(row => ({
      name: row.category,
      value: parseFloat(row.sales || '0'),
      productCount: parseInt(row.product_count || '0'),
      unitsSold: parseInt(row.units_sold || '0')
    }))

    // Get top customers with pagination
    const offset = (page - 1) * limit

    const customersQuery = `
      WITH customer_data AS (
        SELECT
          ${col.storeCode} as store_code,
          MAX(${col.storeName}) as store_name,
          MAX(${col.regionCode}) as region_code,
          MAX(${col.regionName}) as region_name,
          MAX(${col.cityCode}) as city_code,
          MAX(${col.cityName}) as city_name,
          MAX(${col.chainCode}) as chain_code,
          MAX(${col.chainName}) as chain_name,
          MAX(${col.routeCode}) as route_code,
          MAX(${col.fieldUserCode}) as salesman_code,
          MAX(${col.fieldUserName}) as salesman_name,
          MAX(${col.tlCode}) as tl_code,
          MAX(${col.tlName}) as tl_name,
          SUM(${col.netAmount}) as total_sales,
          COUNT(DISTINCT ${col.trxCode}) as order_count,
          SUM(${col.quantity}) as total_quantity,
          AVG(${col.netAmount}) as avg_order_value,
          MAX(${col.trxDateOnly}) as last_order_date,
          CURRENT_DATE - MAX(${col.trxDateOnly}) as days_since_last_order
      FROM ${transactionsTable}
        ${whereClause}
        GROUP BY ${col.storeCode}
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

    const customersResult = await query(customersQuery, [])
    const totalCount = customersResult.rows[0]?.total_count || 0
    const totalPages = Math.ceil(totalCount / limit)

    const topCustomers = customersResult.rows.map(row => ({
      customerCode: row.store_code,
      customerName: row.store_name || 'Unknown',
      region: row.region_name || row.region_code || 'Unknown',
      city: row.city_name || row.city_code || 'Unknown',
      chain: row.chain_name || row.chain_code || 'Unknown',
      routeCode: row.route_code,
      salesmanCode: row.salesman_code,
      salesmanName: row.salesman_name || 'Unknown',
      tlCode: row.tl_code,
      tlName: row.tl_name || 'Unknown',
      totalSales: parseFloat(row.total_sales || '0'),
      orderCount: parseInt(row.order_count || '0'),
      totalQuantity: parseFloat(row.total_quantity || '0'),
      avgOrderValue: parseFloat(row.avg_order_value || '0'),
      lastOrderDate: row.last_order_date,
      daysSinceLastOrder: parseInt(row.days_since_last_order || '0')
    }))

    // Calculate cache duration
    const hasCustomDates = !!(searchParams.get('startDate') && searchParams.get('endDate'))
    const cacheDuration = getCacheDuration(dateRange, hasCustomDates)

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        salesByRegion,
        salesByCity,
        salesByCategory,
        topCustomers,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          showing: `${Math.min((page - 1) * limit + 1, totalCount)} to ${Math.min(page * limit, totalCount)} of ${totalCount}`
        }
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label
      },
      cached: true,
      cacheInfo: {
        duration: cacheDuration,
        dateRange,
        hasCustomDates
      }
    }, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheDuration}, stale-while-revalidate=${cacheDuration * 2}`
      }
    })
    
  } catch (error) {
    console.error('Customer analytics V3 API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

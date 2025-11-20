import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

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
    start: startDate,
    end: endDate,
    startStr: startDate.toISOString().split('T')[0],
    endStr: endDate.toISOString().split('T')[0]
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'lastMonth'
    const classification = searchParams.get('classification')
    const region = searchParams.get('region')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    
    const { startStr: startDate, endStr: endDate } = getDateRangeFromString(dateRange)
    
    await db.initialize()
    
    // Get table info and column expressions
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getTransactionColumnExpressions(tableInfo.columns)
    
    // Check if route_code column exists
    const hasRouteCode = tableInfo.columns.has('route_code') || tableInfo.columns.has('user_route_code')
    const routeCodeExpr = hasRouteCode 
      ? (tableInfo.columns.has('route_code') ? 't.route_code' : 't.user_route_code')
      : 'NULL'

    // Build WHERE clause
    let whereConditions: string[] = [
      `${col.trxDateOnly} >= '${startDate}'`,
      `${col.trxDateOnly} <= '${endDate}'`
    ]

    if (search) {
      whereConditions.push(`(
        LOWER(${col.storeCode}) LIKE LOWER('%${search}%') OR 
        LOWER(COALESCE(${col.storeName}, c.customer_name, '')) LIKE LOWER('%${search}%')
      )`)
    }

    // Add region, city, chain filters if provided
    if (region && region !== 'all') {
      whereConditions.push(`(c.state = '${region}' OR ${col.storeRegion} = '${region}')`)
    }
    if (type && type !== 'all') {
      whereConditions.push(`(c.customer_type = '${type}')`)
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // Get overall metrics
    const metricsQuery = `
      WITH customer_data AS (
        SELECT
          ${col.storeCode} as store_code,
          COALESCE(${col.storeName}, c.customer_name, 'Unknown') as store_name,
          SUM(${col.netAmountValue}) as total_sales,
          COUNT(DISTINCT ${col.trxCode}) as order_count,
          MAX(${col.trxDateOnly}) as last_order_date
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY ${col.storeCode}, COALESCE(${col.storeName}, c.customer_name, 'Unknown')
      )
      SELECT
        COUNT(DISTINCT store_code) as total_customers,
        COUNT(DISTINCT CASE WHEN order_count > 0 THEN store_code END) as active_customers,
        COALESCE(SUM(total_sales), 0) as total_sales,
        COALESCE(SUM(order_count), 0) as total_orders,
        CASE 
          WHEN SUM(order_count) > 0 
          THEN SUM(total_sales) / SUM(order_count) 
          ELSE 0 
        END as avg_order_value,
        COALESCE(SUM(total_sales) * 0.15, 0) as total_outstanding
      FROM customer_data
    `

    let metricsResult
    let metrics = {
      total_customers: 0,
      active_customers: 0,
      total_sales: 0,
      total_orders: 0,
      avg_order_value: 0,
      total_outstanding: 0
    }
    try {
      metricsResult = await query(metricsQuery, [])
      metrics = metricsResult.rows[0] || metrics
    } catch (error) {
      console.error('Error fetching metrics:', error)
    }

    // Get sales by channel (chain code) - Use customer_type from customers_master
    const channelQuery = `
      SELECT
        COALESCE(c.customer_type, 'Unknown') as channel,
        COUNT(DISTINCT ${col.storeCode}) as customer_count,
        SUM(${col.netAmountValue}) as total_sales
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
      ${whereClause}
      GROUP BY COALESCE(c.customer_type, 'Unknown')
      ORDER BY total_sales DESC
    `

    let channelResult
    let salesByChannel = []
    try {
      channelResult = await query(channelQuery, [])
      salesByChannel = channelResult.rows.map(row => ({
      name: row.channel || 'Unknown',
      value: parseFloat(row.total_sales || '0'),
      customers: parseInt(row.customer_count || '0')
    }))
    } catch (error) {
      console.error('Error fetching sales by channel:', error)
      salesByChannel = []
    }

    // Customer classification based on sales
    const classificationQuery = `
      WITH customer_sales AS (
        SELECT
          ${col.storeCode} as store_code,
          SUM(${col.netAmountValue}) as total_sales
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY ${col.storeCode}
      )
      SELECT
        CASE
          WHEN total_sales >= 100000 THEN 'VIP Account'
          WHEN total_sales >= 50000 THEN 'Key Account'
          WHEN total_sales >= 20000 THEN 'A Class'
          WHEN total_sales >= 10000 THEN 'B Class'
          WHEN total_sales >= 5000 THEN 'C Class'
          ELSE 'New Customer'
        END as classification,
        COUNT(*) as customer_count,
        SUM(total_sales) as total_sales
      FROM customer_sales
      GROUP BY 
        CASE
          WHEN total_sales >= 100000 THEN 'VIP Account'
          WHEN total_sales >= 50000 THEN 'Key Account'
          WHEN total_sales >= 20000 THEN 'A Class'
          WHEN total_sales >= 10000 THEN 'B Class'
          WHEN total_sales >= 5000 THEN 'C Class'
          ELSE 'New Customer'
        END
      ORDER BY MIN(total_sales) DESC
    `

    let classificationResult
    let customerClassification = []
    try {
      classificationResult = await query(classificationQuery, [])
      customerClassification = classificationResult.rows.map(row => ({
      classification: row.classification,
      customerCount: parseInt(row.customer_count || '0'),
      totalSales: parseFloat(row.total_sales || '0')
    }))
    } catch (error) {
      console.error('Error fetching customer classification:', error)
      customerClassification = []
    }

    // ABC Analysis (Pareto - 80/20 rule)
    const abcQuery = `
      WITH customer_sales AS (
        SELECT
          ${col.storeCode} as store_code,
          COALESCE(${col.storeName}, c.customer_name, 'Unknown') as store_name,
          SUM(${col.netAmountValue}) as total_sales
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY ${col.storeCode}, COALESCE(${col.storeName}, c.customer_name, 'Unknown')
      ),
      ranked_customers AS (
        SELECT
          *,
          SUM(total_sales) OVER (ORDER BY total_sales DESC) as running_total,
          SUM(total_sales) OVER () as grand_total
        FROM customer_sales
      )
      SELECT
        CASE
          WHEN running_total <= grand_total * 0.80 THEN 'A (Top 80% Revenue)'
          WHEN running_total <= grand_total * 0.95 THEN 'B (Next 15% Revenue)'
          ELSE 'C (Bottom 5% Revenue)'
        END as category,
        COUNT(*) as customer_count,
        SUM(total_sales) as total_sales
      FROM ranked_customers
      GROUP BY 
        CASE
          WHEN running_total <= grand_total * 0.80 THEN 'A (Top 80% Revenue)'
          WHEN running_total <= grand_total * 0.95 THEN 'B (Next 15% Revenue)'
          ELSE 'C (Bottom 5% Revenue)'
        END
      ORDER BY MIN(running_total)
    `

    let abcResult
    let abcAnalysis = []
    try {
      abcResult = await query(abcQuery, [])
      abcAnalysis = abcResult.rows.map(row => ({
      category: row.category,
      customerCount: parseInt(row.customer_count || '0'),
      totalSales: parseFloat(row.total_sales || '0'),
      percentage: metrics.total_sales > 0 
        ? (parseFloat(row.total_sales || '0') / metrics.total_sales * 100) 
        : 0
    }))
    } catch (error) {
      console.error('Error fetching ABC analysis:', error)
      abcAnalysis = []
    }

    // Get top customers with pagination
    let customerWhereConditions = whereConditions.slice() // Copy base conditions

    // Apply classification filter
    if (classification && classification !== 'all') {
      const salesThresholds: {[key: string]: string} = {
        'vip': 'total_sales >= 100000',
        'key': 'total_sales >= 50000 AND total_sales < 100000',
        'a': 'total_sales >= 20000 AND total_sales < 50000',
        'b': 'total_sales >= 10000 AND total_sales < 20000',
        'c': 'total_sales >= 5000 AND total_sales < 10000',
        'new': 'total_sales < 5000'
      }
      
      if (salesThresholds[classification]) {
        // We need to use HAVING for aggregated values
      }
    }

    const offset = (page - 1) * limit

    const customersQuery = `
      WITH customer_data AS (
        SELECT
          ${col.storeCode} as store_code,
          MAX(COALESCE(${col.storeName}, c.customer_name, 'Unknown')) as store_name,
          MAX(COALESCE(${col.storeRegion}, c.region_code, 'N/A')) as region_code,
          MAX(COALESCE(c.state, ${col.storeRegion}, 'Unknown')) as region_name,
          MAX(COALESCE(${col.storeCity}, c.city_code, 'N/A')) as city_code,
          MAX(COALESCE(c.city, ${col.storeCity}, 'Unknown')) as city_name,
          MAX(COALESCE(c.customer_type, 'Unknown')) as chain_code,
          MAX(COALESCE(c.customer_type, 'Unknown')) as chain_name,
          MAX(COALESCE(${routeCodeExpr === 'NULL' ? "'N/A'" : routeCodeExpr}, 'N/A')) as route_code,
          MAX(COALESCE(${routeCodeExpr === 'NULL' ? "'N/A'" : routeCodeExpr}, 'N/A')) as route_name,
          MAX(${col.fieldUserCode}) as salesman_code,
          MAX(${col.fieldUserName}) as salesman_name,
          SUM(${col.netAmountValue}) as total_sales,
          COUNT(DISTINCT ${col.trxCode}) as order_count,
          AVG(${col.netAmountValue}) as avg_order_value,
          MAX(${col.trxDateOnly}) as last_order_date,
          CURRENT_DATE - MAX(${col.trxDateOnly}) as days_since_last_order
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY ${col.storeCode}
        ${classification && classification !== 'all' ? 
          `HAVING ${
            classification === 'vip' ? `SUM(${col.netAmountValue}) >= 100000` :
            classification === 'key' ? `SUM(${col.netAmountValue}) >= 50000 AND SUM(${col.netAmountValue}) < 100000` :
            classification === 'a' ? `SUM(${col.netAmountValue}) >= 20000 AND SUM(${col.netAmountValue}) < 50000` :
            classification === 'b' ? `SUM(${col.netAmountValue}) >= 10000 AND SUM(${col.netAmountValue}) < 20000` :
            classification === 'c' ? `SUM(${col.netAmountValue}) >= 5000 AND SUM(${col.netAmountValue}) < 10000` :
            `SUM(${col.netAmountValue}) < 5000`
          }` : ''}
      ),
      counted AS (
        SELECT COUNT(*) as total_count FROM customer_data
      )
      SELECT 
        customer_data.*,
        counted.total_count,
        (customer_data.total_sales * 0.15) as outstanding_amount
      FROM customer_data
      CROSS JOIN counted
      ORDER BY customer_data.total_sales DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    let customersResult
    let topCustomers = []
    let totalCount = 0
    let totalPages = 0
    try {
      customersResult = await query(customersQuery, [])
      totalCount = customersResult.rows[0]?.total_count || 0
      totalPages = Math.ceil(totalCount / limit)

      topCustomers = customersResult.rows.map(row => ({
      customerCode: row.store_code,
      customerName: row.store_name || 'Unknown',
      region: row.region_name || row.region_code || 'Unknown',
      city: row.city_name || row.city_code || 'Unknown',
      chain: row.chain_name || row.chain_code || 'Unknown',
      routeCode: row.route_code,
      routeName: row.route_name || 'Unknown',
      salesmanCode: row.salesman_code,
      salesmanName: row.salesman_name || 'Unknown',
      totalSales: parseFloat(row.total_sales || '0'),
      orderCount: parseInt(row.order_count || '0'),
      avgOrderValue: parseFloat(row.avg_order_value || '0'),
      lastOrderDate: row.last_order_date,
      daysSinceLastOrder: parseInt(row.days_since_last_order || '0'),
      outstandingAmount: parseFloat(row.outstanding_amount || '0'),
      status: row.days_since_last_order > 30 ? 'Inactive' : 'Active'
    }))
    
    // Log first customer to debug
    if (topCustomers.length > 0) {
      console.log('Analytics V2 - First Customer Sample:', {
        code: topCustomers[0].customerCode,
        name: topCustomers[0].customerName,
        rawStoreName: customersResult.rows[0]?.store_name,
        rawStoreCode: customersResult.rows[0]?.store_code
      })
      }
    } catch (error) {
      console.error('Error fetching top customers:', error)
      topCustomers = []
    }

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          totalCustomers: parseInt(metrics.total_customers || '0'),
          activeCustomers: parseInt(metrics.active_customers || '0'),
          totalSales: parseFloat(metrics.total_sales || '0'),
          totalOrders: parseInt(metrics.total_orders || '0'),
          avgOrderValue: parseFloat(metrics.avg_order_value || '0'),
          totalOutstanding: parseFloat(metrics.total_outstanding || '0'),
          currencyCode: 'INR'
        },
        salesByChannel,
        customerClassification,
        abcAnalysis,
        topCustomers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          pageSize: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          showing: `${offset + 1}-${Math.min(offset + limit, totalCount)} of ${totalCount}`
        }
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: dateRange
      },
      timestamp: new Date().toISOString(),
      source: 'postgresql'
    })

  } catch (error) {
    console.error('Customer analytics API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch customer analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

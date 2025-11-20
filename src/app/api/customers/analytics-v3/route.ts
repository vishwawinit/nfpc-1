import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
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

/**
 * Database Schema Reference:
 * 
 * flat_customers_master:
 *   - customer_code (PK) - joins with transactions table
 *   - customer_name - customer/store name
 *   - state - region/state (use this for region filtering)
 *   - city - city name (use this for city filtering)
 *   - customer_type - chain/type classification (NOT chain_name)
 *   - sales_person_code - assigned salesperson
 *   - city_code - city code
 *   - region_code - region code
 * 
 * flat_transactions / flat_sales_transactions:
 *   - customer_code or store_code - joins with flat_customers_master.customer_code
 *   - transaction_code or trx_code - transaction identifier
 *   - transaction_date or trx_date_only - date for filtering
 *   - net_amount or line_amount - sales amount
 *   - quantity_bu or quantity - quantity
 *   - field_user_code or user_code - salesperson code
 *   - product_code - product identifier
 *   - product_group_level1 or product_group - product category
 */
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
    trxDateOnly: has('trx_date_only') ? 'trx_date_only' : 'DATE(t.transaction_date)',
    trxType: has('trx_type') ? 'trx_type' : has('transaction_type') ? 'transaction_type' : '5',
    netAmount: has('order_total')
      ? 'order_total'
      : has('net_amount')
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
    // Authentication removed - no hierarchy filtering
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
    
    // Verify flat_customers_master columns exist
    try {
      const customerColumnsCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'flat_customers_master' 
        AND column_name IN ('customer_code', 'customer_name', 'state', 'city', 'customer_type', 'chain_name')
      `, [])
      const customerColumns = new Set(customerColumnsCheck.rows.map((r: any) => r.column_name))
      console.log('✅ flat_customers_master columns verified:', Array.from(customerColumns))
      
      if (customerColumns.has('chain_name')) {
        console.warn('⚠️ WARNING: chain_name column exists but we should use customer_type instead')
      }
      if (!customerColumns.has('customer_type')) {
        console.warn('⚠️ WARNING: customer_type column not found in flat_customers_master')
      }
    } catch (error) {
      console.error('❌ Error checking flat_customers_master columns:', error)
    }
    
    // Verify transactions table columns for route_code and update col.routeCode if needed
    let actualRouteCode = col.routeCode
    try {
      const routeColumnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND column_name IN ('user_route_code', 'route_code')
      `, [transactionsTable])
      const routeColumns = new Set(routeColumnCheck.rows.map((r: any) => r.column_name))
      console.log('✅ Route columns in transactions table:', Array.from(routeColumns))
      
      // If the detected column doesn't actually exist, force it to 'NULL'
      if (col.routeCode !== 'NULL' && !routeColumns.has(col.routeCode)) {
        console.warn(`⚠️ WARNING: ${col.routeCode} was detected but doesn't exist. Using 'NULL' instead.`)
        actualRouteCode = 'NULL'
      } else {
        actualRouteCode = col.routeCode
      }
      console.log('✅ Using routeCode expression:', actualRouteCode)
    } catch (error) {
      console.error('❌ Error checking route columns:', error)
      // On error, assume column doesn't exist
      actualRouteCode = 'NULL'
    }

    // Build WHERE clause
    let whereConditions: string[] = []
    
    // Note: Removed trx_type filter to show all transactions for customer analytics
    // If you need to filter by transaction type, uncomment and adjust the value:
    // if (col.trxType !== '5' && col.trxType !== 'NULL') {
    //   whereConditions.push(`t.${col.trxType} = 5`)  // Sales Orders
    // }
    
    // Date range filters - handle both column names and function expressions
    const dateExpr = col.trxDateOnly.startsWith('DATE(') 
      ? col.trxDateOnly 
      : `t.${col.trxDateOnly}`
    whereConditions.push(`${dateExpr} >= '${startDate}'`)
    whereConditions.push(`${dateExpr} <= '${endDate}'`)
    
    // Filter out NULL order_total values
    whereConditions.push(`t.order_total IS NOT NULL`)
    
    // Authentication removed - no hierarchy filtering

    if (customer) {
      whereConditions.push(`t.${col.storeCode} = '${customer}'`)
    }
    
    if (region) {
      // flat_customers_master has 'state' column for region
      whereConditions.push(`COALESCE(c.state, '') = '${region}'`)
    }
    
    if (city) {
      // flat_customers_master has 'city' column
      whereConditions.push(`COALESCE(c.city, '') = '${city}'`)
    }
    
    if (chain) {
      // flat_customers_master has 'customer_type' column for chain classification
      whereConditions.push(`COALESCE(c.customer_type, '') = '${chain}'`)
    }
    
    if (salesman) {
      whereConditions.push(`t.${col.fieldUserCode} = '${salesman}'`)
    }
    
    if (teamLeader) {
      whereConditions.push(`t.${col.tlCode} = '${teamLeader}'`)
    }
    
    if (category) {
      if (col.productGroup === 'NULL') {
        // If product group column doesn't exist, we can't filter by it
        // Skip this filter or use a different approach
      } else {
        whereConditions.push(`t.${col.productGroup} = '${category}'`)
      }
    }
    
    if (search) {
      const storeNameExpr = col.storeName === 'NULL' ? 'c.customer_name' : `COALESCE(t.${col.storeName}, c.customer_name, '')`
      whereConditions.push(`(
        LOWER(t.${col.storeCode}) LIKE LOWER('%${search}%') OR 
        LOWER(${storeNameExpr}) LIKE LOWER('%${search}%')
      )`)
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // Date expression for use in all queries
    const trxDateExpr = col.trxDateOnly.startsWith('DATE(') ? col.trxDateOnly : `t.${col.trxDateOnly}`
    
    // Handle netAmount and quantity expressions for all queries
    // Prioritize order_total for transaction amounts
    const netAmountExpr = col.netAmount === 'order_total'
      ? 'COALESCE(t.order_total, 0)'
      : col.netAmount === '0' 
        ? 'COALESCE(t.order_total, t.net_amount, t.line_amount, 0)'
        : `COALESCE(t.${col.netAmount}, 0)`
    
    const quantityExpr = col.quantity === '0'
      ? 'COALESCE(t.quantity_bu, t.quantity, 0)'
      : `COALESCE(t.${col.quantity}, 0)`

    // Quick test query to verify data exists for the date range
    const testQuery = `
      SELECT COUNT(*) as total_rows, 
             MIN(${trxDateExpr}) as min_date, 
             MAX(${trxDateExpr}) as max_date
      FROM ${transactionsTable} t
      WHERE ${trxDateExpr} >= '${startDate}' AND ${trxDateExpr} <= '${endDate}'
    `
    try {
      const testResult = await query(testQuery, [])
      console.log('🔍 Data availability check:', {
        totalRows: testResult.rows[0]?.total_rows || 0,
        minDate: testResult.rows[0]?.min_date,
        maxDate: testResult.rows[0]?.max_date,
        queryDateRange: { startDate, endDate }
      })
      if (parseInt(testResult.rows[0]?.total_rows || '0') === 0) {
        console.warn('⚠️ WARNING: No data found for date range:', { startDate, endDate })
      }
    } catch (error) {
      console.error('❌ Data availability check failed:', error)
    }

    // Get overall metrics
    const storeNameExpr = col.storeName === 'NULL' ? 'COALESCE(c.customer_name, \'Unknown\')' : `COALESCE(t.${col.storeName}, c.customer_name, 'Unknown')`
    
    const metricsQuery = `
      WITH customer_data AS (
        SELECT
          t.${col.storeCode} as store_code,
          ${storeNameExpr} as store_name,
          SUM(${netAmountExpr}) as total_sales,
          COUNT(DISTINCT t.${col.trxCode}) as order_count,
          MAX(${trxDateExpr}) as last_order_date
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY t.${col.storeCode}, ${storeNameExpr}
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
    
    console.log('🔍 Executing metrics query with date range:', { 
      startDate, 
      endDate, 
      whereClause,
      netAmountExpr,
      quantityExpr,
      table: transactionsTable
    })
    let metricsResult
    try {
      metricsResult = await query(metricsQuery, [])
      console.log('✅ Metrics query successful:', {
        rowCount: metricsResult.rows.length,
        rawData: metricsResult.rows[0]
      })
    } catch (error) {
      console.error('❌ Metrics query failed:', error)
      console.error('Query:', metricsQuery)
      throw error
    }
    
    const rawMetrics = metricsResult.rows[0] || {}
    const metrics = {
      totalCustomers: parseInt(rawMetrics.total_customers || '0'),
      activeCustomers: parseInt(rawMetrics.active_customers || '0'),
      totalSales: parseFloat(rawMetrics.total_sales || '0'),
      totalOrders: parseInt(rawMetrics.total_orders || '0'),
      avgOrderValue: parseFloat(rawMetrics.avg_order_value || '0'),
      currencyCode: 'INR'
    }

    console.log('📊 Metrics calculated:', {
      ...metrics,
      rawValues: {
        total_customers: rawMetrics.total_customers,
        total_sales: rawMetrics.total_sales,
        total_orders: rawMetrics.total_orders,
        avg_order_value: rawMetrics.avg_order_value
      }
    })

    // Sales by Region - Note: flat_customers_master doesn't have region_name, only state
    const regionExpr = col.regionCode === 'NULL' ? 'c.state' : `COALESCE(c.state, t.${col.regionCode}, 'Unknown')`
    const regionNameExpr = col.regionCode === 'NULL' ? 'COALESCE(c.state, \'Unknown\')' : `COALESCE(c.state, t.${col.regionCode}, 'Unknown')`
    const salesByRegionQuery = `
      SELECT
        ${regionExpr} as region_code,
        ${regionNameExpr} as region,
        SUM(${netAmountExpr}) as sales,
        COUNT(DISTINCT t.${col.storeCode}) as customer_count,
        COUNT(DISTINCT t.${col.trxCode}) as order_count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      GROUP BY ${regionExpr}, ${regionNameExpr}
      ORDER BY sales DESC
      LIMIT 10
    `
    
    let regionResult
    try {
      regionResult = await query(salesByRegionQuery, [])
      console.log('✅ Sales by region query successful:', { rowCount: regionResult.rows.length })
    } catch (error) {
      console.error('❌ Sales by region query failed:', error)
      console.error('Query:', salesByRegionQuery)
      regionResult = { rows: [] }
    }
    
    const salesByRegion = regionResult.rows.map(row => ({
      region: row.region || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0')
    }))

    // Sales by City - Note: flat_customers_master doesn't have city_name, only city
    const cityExpr = col.cityCode === 'NULL' ? 'c.city' : `COALESCE(c.city, t.${col.cityCode}, 'Unknown')`
    const cityNameExpr = col.cityCode === 'NULL' ? 'COALESCE(c.city, \'Unknown\')' : `COALESCE(c.city, t.${col.cityCode}, 'Unknown')`
    const salesByCityQuery = `
      SELECT
        ${cityExpr} as city_code,
        ${cityNameExpr} as city,
        SUM(${netAmountExpr}) as sales,
        COUNT(DISTINCT t.${col.storeCode}) as customer_count,
        COUNT(DISTINCT t.${col.trxCode}) as order_count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      GROUP BY ${cityExpr}, ${cityNameExpr}
      ORDER BY sales DESC
      LIMIT 10
    `
    
    let cityResult
    try {
      cityResult = await query(salesByCityQuery, [])
      console.log('✅ Sales by city query successful:', { rowCount: cityResult.rows.length })
    } catch (error) {
      console.error('❌ Sales by city query failed:', error)
      console.error('Query:', salesByCityQuery)
      cityResult = { rows: [] }
    }
    
    const salesByCity = cityResult.rows.map(row => ({
      city: row.city || 'Unknown',
      sales: parseFloat(row.sales || '0'),
      customerCount: parseInt(row.customer_count || '0'),
      orderCount: parseInt(row.order_count || '0')
    }))

    // Sales by Product Category - Handle NULL productGroup properly
    let salesByCategoryQuery = ''
    if (col.productGroup === 'NULL') {
      // If productGroup doesn't exist, return a single "Others" category
      salesByCategoryQuery = `
        SELECT
          'Others' as category,
          SUM(${netAmountExpr}) as sales,
          COUNT(DISTINCT t.product_code) as product_count,
          SUM(${quantityExpr}) as units_sold
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY 1
        ORDER BY sales DESC
        LIMIT 10
      `
    } else {
      // Use actual productGroup column
      const productGroupExpr = `COALESCE(t.${col.productGroup}, 'Others')`
      salesByCategoryQuery = `
        SELECT
          ${productGroupExpr} as category,
          SUM(${netAmountExpr}) as sales,
          COUNT(DISTINCT t.product_code) as product_count,
          SUM(${quantityExpr}) as units_sold
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY ${productGroupExpr}
        ORDER BY sales DESC
        LIMIT 10
      `
    }
    
    let categoryResult
    try {
      categoryResult = await query(salesByCategoryQuery, [])
      console.log('✅ Sales by category query successful:', { rowCount: categoryResult.rows.length })
    } catch (error) {
      console.error('❌ Sales by category query failed:', error)
      console.error('Query:', salesByCategoryQuery)
      categoryResult = { rows: [] }
    }
    
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
          t.${col.storeCode} as store_code,
          MAX(${col.storeName === 'NULL' ? 'c.customer_name' : `COALESCE(t.${col.storeName}, c.customer_name)`}) as store_name,
          MAX(COALESCE(c.state, 'Unknown')) as region_code,
          MAX(COALESCE(c.state, 'Unknown')) as region_name,
          MAX(COALESCE(c.city, 'Unknown')) as city_code,
          MAX(COALESCE(c.city, 'Unknown')) as city_name,
          MAX(COALESCE(c.customer_type, 'Unknown')) as chain_code,
          MAX(COALESCE(c.customer_type, 'Unknown')) as chain_name,
          MAX(${actualRouteCode === 'NULL' ? 'NULL' : `t.${actualRouteCode}`}) as route_code,
          MAX(${col.fieldUserCode === 'NULL' ? 'NULL' : `t.${col.fieldUserCode}`}) as salesman_code,
          MAX(${col.fieldUserName === 'NULL' ? 'NULL' : `t.${col.fieldUserName}`}) as salesman_name,
          MAX(COALESCE(c.sales_person_code, 'Unknown')) as tl_code,
          MAX(COALESCE(c.sales_person_code, 'Unknown')) as tl_name,
          SUM(${netAmountExpr}) as total_sales,
          COUNT(DISTINCT t.${col.trxCode}) as order_count,
          SUM(${quantityExpr}) as total_quantity,
          AVG(${netAmountExpr}) as avg_order_value,
          MAX(${trxDateExpr}) as last_order_date,
          CURRENT_DATE - MAX(${trxDateExpr}) as days_since_last_order
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        GROUP BY t.${col.storeCode}
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

    console.log('🔍 Customer Analytics V3 - Query params:', {
      startDate,
      endDate,
      dateRange,
      table: transactionsTable,
      whereClause: whereConditions.length,
      filters: { customer, region, city, chain, salesman, teamLeader, category },
      columnMappings: {
        storeCode: col.storeCode,
        routeCode: col.routeCode,
        actualRouteCode: actualRouteCode,
        fieldUserCode: col.fieldUserCode,
        chainColumn: 'c.customer_type (NOT c.chain_name)'
      }
    })
    
    let customersResult
    try {
      // Log the actual query for debugging
      console.log('🔍 Executing top customers query with:', {
        routeCodeExpr: col.routeCode,
        actualRouteCode: actualRouteCode,
        routeCodeValue: actualRouteCode === 'NULL' ? 'N/A (literal)' : `t.${actualRouteCode}`,
        chainColumn: 'c.customer_type (NOT c.chain_name)'
      })
      customersResult = await query(customersQuery, [])
      console.log('✅ Top customers query successful:', { rowCount: customersResult.rows.length })
    } catch (error) {
      console.error('❌ Top customers query failed:', error)
      console.error('Full Query (first 1000 chars):', customersQuery.substring(0, 1000))
      console.error('Column mappings:', {
        routeCode: col.routeCode,
        fieldUserCode: col.fieldUserCode,
        storeCode: col.storeCode
      })
      throw error
    }
    
    const totalCount = customersResult.rows[0]?.total_count || 0
    const totalPages = Math.ceil(totalCount / limit)
    
    console.log('📊 Customer Analytics V3 - Results:', {
      totalCount,
      customersReturned: customersResult.rows.length,
      metrics: metrics.totalCustomers > 0 ? 'Has data' : 'No data',
      salesByRegionCount: salesByRegion.length,
      salesByCityCount: salesByCity.length,
      salesByCategoryCount: salesByCategory.length
    })

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

    // Ensure all arrays are defined (even if empty)
    const responseData = {
      metrics: metrics || {
        totalCustomers: 0,
        activeCustomers: 0,
        totalSales: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        currencyCode: 'INR'
      },
      salesByRegion: salesByRegion || [],
      salesByCity: salesByCity || [],
      salesByCategory: salesByCategory || [],
      topCustomers: topCustomers || [],
      pagination: {
        currentPage: page,
        totalPages: totalPages || 0,
        totalRecords: totalCount || 0,
        hasNextPage: page < (totalPages || 0),
        hasPrevPage: page > 1,
        showing: totalCount > 0 
          ? `${Math.min((page - 1) * limit + 1, totalCount)} to ${Math.min(page * limit, totalCount)} of ${totalCount}`
          : '0 to 0 of 0'
      }
    }
    
    console.log('📤 Sending response:', {
      success: true,
      metricsTotalCustomers: responseData.metrics.totalCustomers,
      topCustomersCount: responseData.topCustomers.length,
      salesByRegionCount: responseData.salesByRegion.length,
      salesByCityCount: responseData.salesByCity.length,
      salesByCategoryCount: responseData.salesByCategory.length
    })

    return NextResponse.json({
      success: true,
      data: responseData,
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
    console.error('❌ Customer analytics V3 API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      url: request.url
    })
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        url: request.url,
        searchParams: Object.fromEntries(request.nextUrl.searchParams.entries())
      } : undefined
    }, { status: 500 })
  }
}

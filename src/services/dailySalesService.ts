// Daily Sales Service - Database version
// Provides data access functions for flat_transactions table

import { query } from '../lib/database'

type TransactionsTableInfo = {
  name: string
  columns: Set<string>
}

let transactionsTableInfo: TransactionsTableInfo | null = null

export async function resolveTransactionsTable(): Promise<TransactionsTableInfo> {
  if (transactionsTableInfo) {
    return transactionsTableInfo
  }

  let tableName = 'flat_sales_transactions'

  try {
    const result = await query(`SELECT to_regclass('public.flat_sales_transactions') as sales_table`)
    if (!result.rows[0]?.sales_table) {
      tableName = 'flat_transactions'
    }
  } catch (error) {
    console.warn('[dailySalesService] Table detection failed, defaulting to flat_transactions:', error)
    tableName = 'flat_transactions'
  }

  const columnsResult = await query(
    `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  )

  const columnSet = new Set(columnsResult.rows.map((row: any) => row.column_name))

  transactionsTableInfo = {
    name: tableName,
    columns: columnSet
  }

  console.log(`[dailySalesService] Using ${tableName} as transactions table`)
  return transactionsTableInfo
}

export function getTransactionColumnExpressions(columns: Set<string>) {
  const has = (column: string) => columns.has(column)

  return {
    storeCode: has('store_code') ? 't.store_code' : 't.customer_code',
    storeName: has('store_name') ? 't.store_name' : 'NULL',
    storeRegion: has('store_region_code') ? 't.store_region_code' : 'NULL',
    storeCity: has('store_city_code') ? 't.store_city_code' : 'NULL',
    storeClass: has('store_classification') ? 't.store_classification' : 'NULL',
    tlCode: has('tl_code') ? 't.tl_code' : 'NULL',
    tlName: has('tl_name') ? 't.tl_name' : 'NULL',
    fieldUserCode: has('field_user_code')
      ? 't.field_user_code'
      : has('user_code')
        ? 't.user_code'
        : 'NULL',
    fieldUserName: has('field_user_name') ? 't.field_user_name' : 'NULL',
    fieldUserType: has('field_user_type') ? 't.field_user_type' : 'NULL',
    trxCode: has('trx_code') ? 't.trx_code' : 't.transaction_code',
    trxDate: has('trx_date') ? 't.trx_date' : 't.transaction_date',
    trxDateOnly: has('trx_date_only') ? 't.trx_date_only' : 'DATE(t.transaction_date)',
    quantityValue: has('quantity_bu')
      ? 'COALESCE(t.quantity_bu, 0)'
      : has('quantity')
        ? 'COALESCE(t.quantity, 0)'
        : '0',
    lineAmountValue: has('line_amount')
      ? 'COALESCE(t.line_amount, 0)'
      : has('net_amount')
        ? 'COALESCE(t.net_amount, 0)'
        : '0',
    unitPriceValue: has('unit_price')
      ? 'COALESCE(t.unit_price, 0)'
      : has('net_amount')
        ? 'COALESCE(t.net_amount, 0)'
        : '0',
    discountValue: has('total_discount_amount') ? 'COALESCE(t.total_discount_amount, 0)' : '0',
    netAmountValue: has('net_amount')
      ? 'COALESCE(t.net_amount, t.line_amount, 0)'
      : has('line_amount')
        ? 'COALESCE(t.line_amount, 0)'
        : '0',
    productGroup1: has('product_group_level1') ? 't.product_group_level1' : 'NULL',
    productGroup2: has('product_group_level2') ? 't.product_group_level2' : 'NULL',
    productGroup3: has('product_group_level3') ? 't.product_group_level3' : 'NULL',
    productBaseUom: has('product_base_uom') ? 't.product_base_uom' : 'NULL'
  }
}

// Cache for daily sales data to improve performance
const salesCache = new Map<string, { data: any, timestamp: number, ttl: number }>()
const SALES_CACHE_TTL_MINUTES: Record<string, number> = {
  'today': 5,         // 5 minutes for today
  'yesterday': 60,    // 1 hour for yesterday  
  'thisWeek': 30,     // 30 minutes for this week
  'thisMonth': 60,    // 1 hour for this month
  'lastMonth': 360,   // 6 hours for last month (stable data)
  'thisQuarter': 120, // 2 hours for this quarter
  'lastQuarter': 720, // 12 hours for last quarter (stable data)
  'thisYear': 180,    // 3 hours for this year
  'custom': 15        // 15 minutes for custom dates
}

function getSalesCacheKey(params: any): string {
  const sortedParams = Object.entries(params)
    .filter(([key, value]) => value !== undefined && value !== null && value !== '')
    .sort()
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return sortedParams
}

function getCachedSalesData(cacheKey: string): any | null {
  const cached = salesCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    console.log('Sales Cache HIT for key:', cacheKey)
    return cached.data
  }
  if (cached) {
    salesCache.delete(cacheKey)
    console.log('Sales Cache EXPIRED for key:', cacheKey)
  }
  return null
}

function setCachedSalesData(cacheKey: string, data: any, dateRange: string): void {
  const ttlMinutes = SALES_CACHE_TTL_MINUTES[dateRange] || SALES_CACHE_TTL_MINUTES['custom']
  const ttl = ttlMinutes * 60 * 1000 // Convert to milliseconds
  salesCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl
  })
  console.log(`Sales Cache SET for key: ${cacheKey}, TTL: ${ttlMinutes}min`)
}

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string, currentDate: string = new Date().toISOString().split('T')[0]) => {
  const current = new Date(currentDate)
  let startDate: Date
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
    case 'last7days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'last30days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
      break
    case 'thisWeek':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - current.getDay())
      break
    case 'lastWeek':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - current.getDay() - 7)
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)
      break
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
  }

  return { startDate, endDate }
}

/**
 * Get filter options from database
 */
export const getFilterOptions = async () => {
  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  const categoriesPromise = columns.has('product_group_level1')
    ? query(`
        SELECT DISTINCT
          COALESCE(product_group_level1, 'Unknown') as "productCategory",
          COALESCE(product_group_level2, 'Unknown') as "productSubcategory",
          COALESCE(product_group_level3, 'Unknown') as "productGroup"
        FROM ${transactionsTable}
        WHERE product_group_level1 IS NOT NULL
        ORDER BY product_group_level1
        LIMIT 200
      `)
    : Promise.resolve({ rows: [] })

  const [stores, products, users, regions, currencies, categories] = await Promise.all([
    query(`
      SELECT DISTINCT
        ${col.storeCode} as "storeCode",
        COALESCE(${col.storeName}, c.customer_name, 'Unknown Store') as "storeName"
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
      WHERE ${col.storeCode} IS NOT NULL
      ORDER BY COALESCE(${col.storeName}, c.customer_name, ${col.storeCode})
      LIMIT 200
    `),
    query(`
      SELECT DISTINCT
        t.product_code as "productCode",
        COALESCE(t.product_name, t.product_code) as "productName",
        COALESCE(${col.productGroup1}, 'Unknown') as "productCategory"
      FROM ${transactionsTable}
      WHERE t.product_code IS NOT NULL
      ORDER BY COALESCE(t.product_name, t.product_code)
      LIMIT 200
    `),
    query(`
      SELECT DISTINCT
        ${col.fieldUserCode} as "userCode",
        COALESCE(${col.fieldUserName}, ${col.fieldUserCode}) as "userName",
        COALESCE(${col.fieldUserType}, 'Field User') as "userType"
      FROM ${transactionsTable} t
      WHERE ${col.fieldUserCode} IS NOT NULL
      ORDER BY ${col.fieldUserCode}
      LIMIT 200
    `),
    query(`
      SELECT DISTINCT
        state as "regionCode",
        city as "cityCode"
      FROM flat_customers_master
      WHERE state IS NOT NULL
      ORDER BY state
      LIMIT 200
    `),
    query(`
      SELECT DISTINCT COALESCE(currency_code, 'AED') as "currencyCode"
      FROM ${transactionsTable}
      WHERE currency_code IS NOT NULL
      ORDER BY currency_code
    `),
    categoriesPromise
  ])

  return {
    stores: stores.rows,
    products: products.rows,
    users: users.rows,
    regions: regions.rows,
    currencies: currencies.rows,
    categories: categories.rows
  }
}

/**
 * Get daily sales summary with filters and caching
 */
export const getDailySalesSummary = async (filters: any = {}) => {
  // Check cache first
  const cacheKey = getSalesCacheKey({...filters, function: 'getDailySalesSummary'})
  const cachedData = getCachedSalesData(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  console.log('Daily Sales Summary: Fetching data for date range:', { startDateStr, endDateStr, filters })

  let sql = `
    SELECT
      COUNT(DISTINCT ${col.trxCode}) as total_orders,
      COUNT(DISTINCT ${col.storeCode}) as total_stores,
      COUNT(DISTINCT t.product_code) as total_products,
      COUNT(DISTINCT ${col.fieldUserCode}) as total_users,
      COALESCE(SUM(ABS(${col.quantityValue})), 0) as total_quantity,
      COALESCE(SUM(CASE WHEN (${col.netAmountValue}) >= 0 THEN (${col.netAmountValue}) ELSE 0 END), 0) as gross_sales,
      COALESCE(SUM(CASE WHEN (${col.netAmountValue}) < 0 THEN ABS(${col.netAmountValue}) ELSE 0 END), 0) as return_sales,
      COALESCE(SUM(ABS(${col.discountValue})), 0) as total_discount,
      COALESCE(SUM(${col.netAmountValue}), 0) as total_net_sales,
      COALESCE(MAX(t.currency_code), 'AED') as currency_code
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  // Apply filters with proper column references
  if (filters.regionCode) {
    sql += ` AND COALESCE(${col.storeRegion}, c.state) = $${paramCount}`
    params.push(filters.regionCode)
    paramCount++
  }

  if (filters.cityCode) {
    sql += ` AND COALESCE(${col.storeCity}, c.city) = $${paramCount}`
    params.push(filters.cityCode)
    paramCount++
  }

  if (filters.teamLeaderCode) {
    sql += ` AND COALESCE(${col.tlCode}, c.sales_person_code) = $${paramCount}`
    params.push(filters.teamLeaderCode)
    paramCount++
  }

  if (filters.fieldUserRole) {
    sql += ` AND COALESCE(${col.fieldUserType}, 'Field User') = $${paramCount}`
    params.push(filters.fieldUserRole)
    paramCount++
  }

  if (filters.userCode) {
    sql += ` AND ${col.fieldUserCode} = $${paramCount}`
    params.push(filters.userCode)
    paramCount++
  }

  if (filters.chainName) {
    sql += ` AND COALESCE(c.customer_type, ${col.storeClass}, 'Unknown') = $${paramCount}`
    params.push(filters.chainName)
    paramCount++
  }

  if (filters.storeCode) {
    sql += ` AND ${col.storeCode} = $${paramCount}`
    params.push(filters.storeCode)
    paramCount++
  }

  if (filters.productCode) {
    sql += ` AND t.product_code = $${paramCount}`
    params.push(filters.productCode)
    paramCount++
  }

  if (filters.productCategory) {
    if (col.productGroup1 !== 'NULL') {
      sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }
  }

  console.log('Daily Sales Summary: Executing query with params:', params)
  const result = await query(sql, params)
  const stats = result.rows[0]

  const totalOrders = parseInt(stats.total_orders) || 0
  const totalStores = parseInt(stats.total_stores) || 0
  const totalProducts = parseInt(stats.total_products) || 0
  const totalUsers = parseInt(stats.total_users) || 0
  const totalQuantity = parseFloat(stats.total_quantity) || 0
  const grossSales = parseFloat(stats.gross_sales) || 0
  const returnSales = parseFloat(stats.return_sales) || 0
  const totalDiscount = parseFloat(stats.total_discount) || 0
  const totalNetSales = parseFloat(stats.total_net_sales) || 0

  const summaryData = {
    totalOrders,
    totalStores,
    totalProducts,
    totalUsers,
    totalQuantity,
    totalSales: grossSales,
    totalReturns: returnSales,
    totalDiscount,
    totalNetSales,
    avgOrderValue: totalOrders > 0 ? totalNetSales / totalOrders : 0,
    currencyCode: stats.currency_code || 'AED'
  }

  console.log('Daily Sales Summary: Results:', summaryData)

  // Cache the result
  const dateRange = filters.dateRange || 'custom'
  setCachedSalesData(cacheKey, summaryData, dateRange)

  return summaryData
}

/**
 * Get daily sales trend with caching
 */
export const getDailyTrend = async (filters: any = {}) => {
  // Check cache first
  const cacheKey = getSalesCacheKey({...filters, function: 'getDailyTrend'})
  const cachedData = getCachedSalesData(cacheKey)
  if (cachedData) {
    return cachedData
  }

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  console.log('Daily Trend: Fetching data for date range:', { startDateStr, endDateStr, filters })

  let sql = `
    SELECT
      ${col.trxDateOnly} as date,
      COUNT(DISTINCT ${col.trxCode}) as orders,
      COALESCE(SUM(ABS(${col.quantityValue})), 0) as quantity,
      COALESCE(SUM(${col.netAmountValue}), 0) as sales,
      COUNT(DISTINCT ${col.storeCode}) as stores,
      COUNT(DISTINCT ${col.storeCode}) as customers,
      COUNT(DISTINCT t.product_code) as products
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  // Apply filters with proper column references
  if (filters.regionCode) {
    sql += ` AND COALESCE(${col.storeRegion}, c.state) = $${paramCount}`
    params.push(filters.regionCode)
    paramCount++
  }

  if (filters.cityCode) {
    sql += ` AND COALESCE(${col.storeCity}, c.city) = $${paramCount}`
    params.push(filters.cityCode)
    paramCount++
  }

  if (filters.teamLeaderCode) {
    sql += ` AND COALESCE(${col.tlCode}, c.sales_person_code) = $${paramCount}`
    params.push(filters.teamLeaderCode)
    paramCount++
  }

  if (filters.fieldUserRole) {
    sql += ` AND COALESCE(${col.fieldUserType}, 'Field User') = $${paramCount}`
    params.push(filters.fieldUserRole)
    paramCount++
  }

  if (filters.userCode) {
    sql += ` AND ${col.fieldUserCode} = $${paramCount}`
    params.push(filters.userCode)
    paramCount++
  }

  if (filters.chainName) {
    sql += ` AND COALESCE(c.customer_type, ${col.storeClass}, 'Unknown') = $${paramCount}`
    params.push(filters.chainName)
    paramCount++
  }

  if (filters.storeCode) {
    sql += ` AND ${col.storeCode} = $${paramCount}`
    params.push(filters.storeCode)
    paramCount++
  }

  if (filters.productCode) {
    sql += ` AND t.product_code = $${paramCount}`
    params.push(filters.productCode)
    paramCount++
  }

  if (filters.productCategory && col.productGroup1 !== 'NULL') {
    sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }
  
  sql += ` GROUP BY ${col.trxDateOnly} ORDER BY ${col.trxDateOnly}`

  console.log('Daily Trend: Executing query with params:', params)
  const result = await query(sql, params)

  const trendData = result.rows.map((row: any) => ({
    date: row.date,
    orders: parseInt(row.orders) || 0,
    quantity: parseFloat(row.quantity) || 0,
    sales: parseFloat(row.sales) || 0,
    stores: parseInt(row.stores) || 0,
    customers: parseInt(row.customers) || 0,
    products: parseInt(row.products) || 0
  }))

  console.log('Daily Trend: Results count:', trendData.length)

  // Cache the result
  const dateRange = filters.dateRange || 'custom'
  setCachedSalesData(cacheKey, trendData, dateRange)

  return trendData
}

/**
 * Get product performance
 */
export const getProductPerformance = async (filters: any = {}) => {
  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  let sql = `
    SELECT
      t.product_code as "productCode",
      COALESCE(MAX(t.product_name), t.product_code) as "productName",
      COALESCE(MAX(${col.productGroup1}), 'Unknown') as "productCategory",
      COALESCE(MAX(${col.productGroup2}), 'Unknown') as "productSubcategory",
      COALESCE(MAX(${col.productGroup3}), 'Unknown') as "productGroup",
      COALESCE(MAX(${col.productBaseUom}), 'PCS') as "productUom",
      COUNT(DISTINCT ${col.trxCode}) as orders,
      COUNT(DISTINCT ${col.storeCode}) as stores,
      COALESCE(SUM(ABS(${col.quantityValue})), 0) as quantity,
      COALESCE(SUM(ABS(${col.lineAmountValue})), 0) as sales,
      COALESCE(SUM(ABS(${col.discountValue})), 0) as discount,
      COALESCE(SUM(ABS(${col.netAmountValue})), 0) as net_sales,
      COALESCE(AVG(NULLIF(ABS(${col.lineAmountValue}), 0)), 0) as avg_price
    FROM ${transactionsTable} t
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
      AND t.product_code IS NOT NULL
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  if (filters.userCode) {
    sql += ` AND ${col.fieldUserCode} = $${paramCount}`
    params.push(filters.userCode)
    paramCount++
  }

  if (filters.storeCode) {
    sql += ` AND ${col.storeCode} = $${paramCount}`
    params.push(filters.storeCode)
    paramCount++
  }
  
  if (filters.productCategory && col.productGroup1 !== 'NULL') {
    sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }

  sql += `
    GROUP BY t.product_code
    ORDER BY net_sales DESC
    LIMIT 100
  `

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    productCode: row.productCode,
    productName: row.productName,
    productCategory: row.productCategory,
    productSubcategory: row.productSubcategory,
    productGroup: row.productGroup,
    productUom: row.productUom,
    orders: parseInt(row.orders),
    stores: parseInt(row.stores),
    quantity: parseFloat(row.quantity),
    sales: parseFloat(row.sales),
    discount: parseFloat(row.discount),
    netSales: parseFloat(row.net_sales),
    avgPrice: parseFloat(row.avg_price)
  }))
}

/**
 * Get store performance
 */
export const getStorePerformance = async (filters: any = {}) => {
  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  let sql = `
    SELECT
      ${col.storeCode} as "storeCode",
      COALESCE(MAX(${col.storeName}), MAX(c.customer_name), 'Unknown Store') as "storeName",
      COALESCE(MAX(c.customer_type), MAX(${col.storeClass}), 'Unknown') as "storeClass",
      COALESCE(MAX(${col.storeCity}), MAX(c.city), 'Unknown') as "cityCode",
      COALESCE(MAX(${col.storeRegion}), MAX(c.state), 'Unknown') as "regionCode",
      'Unknown' as "countryCode",
      COUNT(DISTINCT ${col.trxCode}) as orders,
      COUNT(DISTINCT t.product_code) as products,
      COUNT(DISTINCT ${col.fieldUserCode}) as users,
      COALESCE(SUM(ABS(${col.quantityValue})), 0) as quantity,
      COALESCE(SUM(ABS(${col.lineAmountValue})), 0) as sales,
      COALESCE(SUM(ABS(${col.discountValue})), 0) as discount,
      COALESCE(SUM(ABS(${col.netAmountValue})), 0) as net_sales,
      COALESCE(AVG(NULLIF(ABS(${col.netAmountValue}), 0)), 0) as avg_order_value
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  if (filters.regionCode) {
    sql += ` AND COALESCE(${col.storeRegion}, c.state) = $${paramCount}`
    params.push(filters.regionCode)
    paramCount++
  }

  if (filters.userCode) {
    sql += ` AND ${col.fieldUserCode} = $${paramCount}`
    params.push(filters.userCode)
    paramCount++
  }

  if (filters.productCode) {
    sql += ` AND t.product_code = $${paramCount}`
    params.push(filters.productCode)
    paramCount++
  }
  
  if (filters.productCategory && col.productGroup1 !== 'NULL') {
    sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }

  sql += `
    GROUP BY ${col.storeCode}
    ORDER BY net_sales DESC
    LIMIT 100
  `

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    storeCode: row.storeCode,
    storeName: row.storeName,
    storeClass: row.storeClass,
    cityCode: row.cityCode,
    regionCode: row.regionCode,
    countryCode: row.countryCode,
    orders: parseInt(row.orders),
    products: parseInt(row.products),
    users: parseInt(row.users),
    quantity: parseFloat(row.quantity),
    sales: parseFloat(row.sales),
    discount: parseFloat(row.discount),
    netSales: parseFloat(row.net_sales),
    avgOrderValue: parseFloat(row.avg_order_value)
  }))
}

/**
 * Get user/field rep performance
 */
export const getUserPerformance = async (filters: any = {}) => {
  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  let sql = `
    SELECT
      ${col.fieldUserCode} as "userCode",
      COALESCE(${col.fieldUserName}, ${col.fieldUserCode}) as "userName",
      COALESCE(${col.fieldUserType}, 'Field User') as "userType",
      COUNT(DISTINCT ${col.trxCode}) as orders,
      COUNT(DISTINCT ${col.storeCode}) as stores,
      COUNT(DISTINCT t.product_code) as products,
      COALESCE(SUM(ABS(${col.quantityValue})), 0) as quantity,
      COALESCE(SUM(ABS(${col.lineAmountValue})), 0) as sales,
      COALESCE(SUM(ABS(${col.discountValue})), 0) as discount,
      COALESCE(SUM(ABS(${col.netAmountValue})), 0) as net_sales,
      COALESCE(AVG(NULLIF(ABS(${col.netAmountValue}), 0)), 0) as avg_order_value
    FROM ${transactionsTable} t
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
      AND ${col.fieldUserCode} IS NOT NULL
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  if (filters.storeCode) {
    sql += ` AND ${col.storeCode} = $${paramCount}`
    params.push(filters.storeCode)
    paramCount++
  }

  if (filters.productCode) {
    sql += ` AND t.product_code = $${paramCount}`
    params.push(filters.productCode)
    paramCount++
  }
  
  if (filters.productCategory && col.productGroup1 !== 'NULL') {
    sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }

  sql += `
    GROUP BY ${col.fieldUserCode}, COALESCE(${col.fieldUserName}, ${col.fieldUserCode}), COALESCE(${col.fieldUserType}, 'Field User')
    ORDER BY net_sales DESC
    LIMIT 100
  `

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    userCode: row.userCode,
    userName: row.userName,
    userType: row.userType,
    orders: parseInt(row.orders),
    stores: parseInt(row.stores),
    products: parseInt(row.products),
    quantity: parseFloat(row.quantity),
    sales: parseFloat(row.sales),
    discount: parseFloat(row.discount),
    netSales: parseFloat(row.net_sales),
    avgOrderValue: parseFloat(row.avg_order_value)
  }))
}

/**
 * Get transaction details
 */
export const getTransactionDetails = async (filters: any = {}) => {
  const { startDate, endDate } = filters.startDate && filters.endDate
    ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
    : filters.dateRange
    ? getDateRangeFromString(filters.dateRange)
    : getDateRangeFromString('last7days')

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  const { name: transactionsTable, columns } = await resolveTransactionsTable()
  const col = getTransactionColumnExpressions(columns)

  let sql = `
    SELECT
      ${col.trxCode} as "trxCode",
      ${col.trxDate} as "trxDate",
      ${col.trxDateOnly} as "trxDateOnly",
      ${col.fieldUserCode} as "fieldUserCode",
      COALESCE(${col.fieldUserName}, ${col.fieldUserCode}) as "fieldUserName",
      COALESCE(${col.fieldUserType}, 'Field User') as "fieldUserRole",
      COALESCE(${col.tlCode}, 'Unknown') as "tlCode",
      COALESCE(${col.tlName}, 'Unknown') as "tlName",
      COALESCE(${col.storeRegion}, c.state, 'Unknown') as "regionCode",
      COALESCE(${col.storeCity}, c.city, 'Unknown') as "cityCode",
      ${col.storeCode} as "storeCode",
      COALESCE(${col.storeName}, c.customer_name, 'Unknown Store') as "storeName",
      t.product_code as "productCode",
      t.product_name as "productName",
      COALESCE(${col.productGroup1}, 'Unknown') as "productCategory",
      ${col.quantityValue} as quantity,
      ${col.unitPriceValue} as "unitPrice",
      ${col.lineAmountValue} as "lineAmount",
      COALESCE(t.currency_code, 'AED') as "currencyCode",
      COALESCE(c.customer_type, ${col.storeClass}, 'Unknown') as "storeClass"
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
  `

  const params: any[] = [startDateStr, endDateStr]
  let paramCount = 3

  if (filters.userCode) {
    sql += ` AND ${col.fieldUserCode} = $${paramCount}`
    params.push(filters.userCode)
    paramCount++
  }

  if (filters.storeCode) {
    sql += ` AND ${col.storeCode} = $${paramCount}`
    params.push(filters.storeCode)
    paramCount++
  }

  if (filters.productCode) {
    sql += ` AND t.product_code = $${paramCount}`
    params.push(filters.productCode)
    paramCount++
  }
  
  if (filters.productCategory && col.productGroup1 !== 'NULL') {
    sql += ` AND ${col.productGroup1} = $${paramCount}`
    params.push(filters.productCategory)
    paramCount++
  }

  sql += ` ORDER BY ${col.trxDate} DESC, ${col.trxCode}`

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    trxCode: row.trxCode,
    trxDate: row.trxDate,
    trxDateOnly: row.trxDateOnly,
    fieldUserCode: row.fieldUserCode,
    fieldUserName: row.fieldUserName,
    fieldUserRole: row.fieldUserRole,
    tlCode: row.tlCode,
    tlName: row.tlName,
    regionCode: row.regionCode,
    cityCode: row.cityCode,
    storeCode: row.storeCode,
    storeName: row.storeName,
    productCode: row.productCode,
    productName: row.productName,
    productCategory: row.productCategory,
    quantity: parseFloat(row.quantity),
    unitPrice: parseFloat(row.unitPrice),
    lineAmount: parseFloat(row.lineAmount),
    paymentType: 'Cash',
    trxStatus: 'Completed'
  }))
}

export const dailySalesService = {
  getFilterOptions,
  getDailySalesSummary,
  getDailyTrend,
  getProductPerformance,
  getStorePerformance,
  getUserPerformance,
  getTransactionDetails
}

export default dailySalesService

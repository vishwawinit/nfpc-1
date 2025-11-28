// Daily Sales Service - Using flat_daily_sales_report table
// This table contains denormalized transaction data with all related information

import { query } from '../lib/database'

// Table name constant
const SALES_TABLE = 'flat_daily_sales_report'

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
    case 'thisWeek':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'last30days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
      break
    case 'thisMonth':
      // This month: 1st day to TODAY (inclusive)
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      endDate = new Date(current)
      break
    case 'lastMonth':
      // Last month: 1st to last day of previous month
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisYear':
      // This year: Jan 1 to TODAY (inclusive)
      startDate = new Date(current.getFullYear(), 0, 1)
      endDate = new Date(current)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
  }

  return { startDate, endDate }
}

/**
 * Build WHERE clause with filters for flat table
 */
const buildWhereClause = (filters: any, params: any[], startParamIndex: number = 3) => {
  const conditions: string[] = []
  let paramCount = startParamIndex

  // Date filters (always include) - optimized to use indexes
  // Don't wrap column in DATE() function to allow index usage
  conditions.push(`trx_trxdate >= $1::timestamp`)
  conditions.push(`trx_trxdate < ($2::timestamp + INTERVAL '1 day')`)

  // Transaction type filter (1 = Sales)
  conditions.push(`trx_trxtype = 1`)

  // Area filter (support both old regionCode and new areaCode)
  if (filters.areaCode || filters.regionCode) {
    conditions.push(`route_areacode = $${paramCount}`)
    params.push(filters.areaCode || filters.regionCode)
    paramCount++
  }

  // Sub Area filter (support both old cityCode and new subAreaCode)
  if (filters.subAreaCode || filters.cityCode) {
    conditions.push(`route_subareacode = $${paramCount}`)
    params.push(filters.subAreaCode || filters.cityCode)
    paramCount++
  }

  // Team Leader filter (via route_salesmancode)
  if (filters.teamLeaderCode) {
    conditions.push(`route_salesmancode = $${paramCount}`)
    params.push(filters.teamLeaderCode)
    paramCount++
  }

  // Field User Role filter
  if (filters.fieldUserRole) {
    conditions.push(`user_usertype = $${paramCount}`)
    params.push(filters.fieldUserRole)
    paramCount++
  }

  // User Code filter
  if (filters.userCode) {
    conditions.push(`trx_usercode = $${paramCount}`)
    params.push(filters.userCode)
    paramCount++
  }

  // Chain Name filter
  if (filters.chainName) {
    conditions.push(`customer_channel_description = $${paramCount}`)
    params.push(filters.chainName)
    paramCount++
  }

  // Store Code filter
  if (filters.storeCode) {
    conditions.push(`customer_code = $${paramCount}`)
    params.push(filters.storeCode)
    paramCount++
  }

  // Product Code filter
  if (filters.productCode) {
    conditions.push(`line_itemcode = $${paramCount}`)
    params.push(filters.productCode)
    paramCount++
  }

  // Product Category filter
  if (filters.productCategory) {
    conditions.push(`item_grouplevel1 = $${paramCount}`)
    params.push(filters.productCategory)
    paramCount++
  }

  // Route Code filter
  if (filters.routeCode) {
    conditions.push(`trx_routecode = $${paramCount}`)
    params.push(filters.routeCode)
    paramCount++
  }

  return {
    whereClause: `WHERE ${conditions.join(' AND ')}`,
    paramCount
  }
}

/**
 * Get filter options from flat table
 */
export const getFilterOptions = async (filters: any = {}) => {
  try {
    // Base date filter
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : getDateRangeFromString('thisYear')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Get distinct values for filters
    const [regions, cities, roles, teamLeaders, users, chains, stores] = await Promise.all([
      // Areas (formerly Regions)
      query(`
        SELECT DISTINCT
          route_areacode as value,
          route_areacode as label
        FROM ${SALES_TABLE}
        WHERE route_areacode IS NOT NULL
          AND route_areacode != ''
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
        LIMIT 100
      `, [startDateStr, endDateStr]),

      // Sub Areas (formerly Cities)
      query(`
        SELECT DISTINCT
          route_subareacode as value,
          route_subareacode as label
        FROM ${SALES_TABLE}
        WHERE route_subareacode IS NOT NULL
          AND route_subareacode != ''
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
        LIMIT 100
      `, [startDateStr, endDateStr]),

      // Field User Roles
      query(`
        SELECT DISTINCT
          user_usertype as value,
          user_usertype as label
        FROM ${SALES_TABLE}
        WHERE user_usertype IS NOT NULL
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
      `, [startDateStr, endDateStr]),

      // Team Leaders
      query(`
        SELECT DISTINCT
          route_salesmancode as value,
          route_salesmancode as label,
          COUNT(DISTINCT trx_usercode) as "userCount"
        FROM ${SALES_TABLE}
        WHERE route_salesmancode IS NOT NULL
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        GROUP BY route_salesmancode
        ORDER BY route_salesmancode
        LIMIT 200
      `, [startDateStr, endDateStr]),

      // Field Users
      query(`
        SELECT DISTINCT
          trx_usercode as value,
          COALESCE(user_description, trx_usercode) as label,
          user_usertype as role
        FROM ${SALES_TABLE}
        WHERE trx_usercode IS NOT NULL
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
        LIMIT 500
      `, [startDateStr, endDateStr]),

      // Chains
      query(`
        SELECT DISTINCT
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as value,
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as label
        FROM ${SALES_TABLE}
        WHERE (customer_channel_description IS NOT NULL OR customer_channelcode IS NOT NULL)
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
      `, [startDateStr, endDateStr]),

      // Stores
      query(`
        SELECT DISTINCT
          customer_code as value,
          COALESCE(customer_description, customer_code) as label
        FROM ${SALES_TABLE}
        WHERE customer_code IS NOT NULL
          AND trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        ORDER BY label
        LIMIT 500
      `, [startDateStr, endDateStr])
    ])

    return {
      regions: regions.rows,
      cities: cities.rows,
      fieldUserRoles: roles.rows,
      teamLeaders: teamLeaders.rows,
      fieldUsers: users.rows,
      chains: chains.rows,
      stores: stores.rows,
      summary: {
        totalRegions: regions.rows.length,
        totalCities: cities.rows.length,
        totalUsers: users.rows.length,
        totalTeamLeaders: teamLeaders.rows.length,
        totalChains: chains.rows.length,
        totalStores: stores.rows.length
      }
    }
  } catch (error) {
    console.error('❌ Error getting filter options:', error)
    return {
      regions: [],
      cities: [],
      fieldUserRoles: [],
      teamLeaders: [],
      fieldUsers: [],
      chains: [],
      stores: [],
      summary: {
        totalRegions: 0,
        totalCities: 0,
        totalUsers: 0,
        totalTeamLeaders: 0,
        totalChains: 0,
        totalStores: 0
      }
    }
  }
}

/**
 * Get daily sales summary from flat table
 */
export const getDailySalesSummary = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause } = buildWhereClause(filters, params)

    const sql = `
      SELECT
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as total_orders,
        COUNT(DISTINCT customer_code) as total_stores,
        COUNT(DISTINCT trx_usercode) as total_users,
        COUNT(DISTINCT line_itemcode) as total_products,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as gross_sales,
        COALESCE(SUM(CASE WHEN trx_totalamount < 0 THEN ABS(trx_totalamount) ELSE 0 END), 0) as return_sales,
        COALESCE(SUM(trx_totaldiscountamount), 0) as total_discount,
        COALESCE(SUM(trx_totalamount), 0) as total_net_sales,
        COALESCE(SUM(ABS(line_quantitybu)), 0) as total_quantity,
        COALESCE(MAX(trx_currencycode), 'AED') as currency_code
      FROM ${SALES_TABLE}
      ${whereClause}
    `

    console.log('📊 Summary SQL:', sql)
    console.log('📊 Summary params:', params)

    const result = await query(sql, params)
    const stats = result.rows[0]

    console.log('📊 Raw database result:', stats)
    console.log('📊 gross_sales value:', stats.gross_sales)
    console.log('📊 total_orders value:', stats.total_orders)

    const totalOrders = parseInt(stats.total_orders) || 0
    const totalNetSales = parseFloat(stats.total_net_sales) || 0

    return {
      totalOrders,
      totalStores: parseInt(stats.total_stores) || 0,
      totalUsers: parseInt(stats.total_users) || 0,
      totalProducts: parseInt(stats.total_products) || 0,
      totalSales: parseFloat(stats.gross_sales) || 0,
      totalReturns: parseFloat(stats.return_sales) || 0,
      totalDiscount: parseFloat(stats.total_discount) || 0,
      totalNetSales,
      avgOrderValue: totalOrders > 0 ? totalNetSales / totalOrders : 0,
      currencyCode: stats.currency_code || 'AED',
      totalQuantity: parseFloat(stats.total_quantity) || 0
    }
  } catch (error) {
    console.error('❌ Error in getDailySalesSummary:', error)
    throw error
  }
}

/**
 * Get daily trend from flat table
 */
export const getDailyTrend = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause } = buildWhereClause(filters, params)

    const sql = `
      SELECT
        DATE(trx_trxdate)::date as date,
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
        COUNT(DISTINCT customer_code) as stores,
        COUNT(DISTINCT customer_code) as customers,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY DATE(trx_trxdate)::date
      ORDER BY date ASC
    `

    console.log('📈 Trend SQL:', sql)
    console.log('📈 Trend params:', params)

    const result = await query(sql, params)

    return result.rows.map((row: any) => ({
      date: row.date,
      orders: parseInt(row.orders) || 0,
      stores: parseInt(row.stores) || 0,
      customers: parseInt(row.customers) || 0,
      sales: parseFloat(row.sales) || 0
    }))
  } catch (error) {
    console.error('❌ Error in getDailyTrend:', error)
    throw error
  }
}

/**
 * Get product performance from flat table
 */
export const getProductPerformance = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause } = buildWhereClause(filters, params)

    const sql = `
      SELECT
        line_itemcode as "productCode",
        MAX(COALESCE(line_itemdescription, item_description, line_itemcode)) as "productName",
        MAX(COALESCE(item_grouplevel1, 'Unknown')) as "productCategory",
        MAX(COALESCE(line_uom, 'PCS')) as "productUom",
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
        COUNT(DISTINCT customer_code) as stores,
        COALESCE(SUM(ABS(line_quantitybu)), 0) as quantity,
        COALESCE(SUM(CASE WHEN (line_baseprice * line_quantitybu) > 0 THEN (line_baseprice * line_quantitybu) ELSE 0 END), 0) as sales,
        COALESCE(SUM(line_totaldiscountamount), 0) as discount,
        COALESCE(SUM((line_baseprice * line_quantitybu) - COALESCE(line_totaldiscountamount, 0)), 0) as net_sales,
        COALESCE(AVG(NULLIF(line_baseprice, 0)), 0) as avg_price
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY line_itemcode
      ORDER BY net_sales DESC
    `

    console.log('📦 Product SQL:', sql)
    console.log('📦 Product params:', params)

    const result = await query(sql, params)

    return result.rows.map((row: any) => ({
      productCode: row.productCode,
      productName: row.productName,
      productCategory: row.productCategory,
      productUom: row.productUom,
      orders: parseInt(row.orders) || 0,
      stores: parseInt(row.stores) || 0,
      quantity: parseFloat(row.quantity) || 0,
      sales: parseFloat(row.sales) || 0,
      discount: parseFloat(row.discount) || 0,
      netSales: parseFloat(row.net_sales) || 0,
      avgPrice: parseFloat(row.avg_price) || 0
    }))
  } catch (error) {
    console.error('❌ Error in getProductPerformance:', error)
    throw error
  }
}

/**
 * Get store performance from flat table
 */
export const getStorePerformance = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause } = buildWhereClause(filters, params)

    const sql = `
      SELECT
        customer_code as "storeCode",
        MAX(COALESCE(customer_description, customer_code)) as "storeName",
        MAX(COALESCE(customer_regioncode, 'Unknown')) as "regionCode",
        MAX(COALESCE(region_description, customer_regioncode)) as "regionName",
        MAX(COALESCE(city_description, customer_citycode)) as "cityName",
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
        COUNT(DISTINCT trx_usercode) as users,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COALESCE(SUM(trx_totaldiscountamount), 0) as discount,
        COALESCE(SUM(trx_totalamount), 0) as net_sales,
        COALESCE(SUM(trx_totalamount) / NULLIF(COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END), 0), 0) as avg_order_value
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY customer_code
      ORDER BY net_sales DESC
    `

    console.log('🏪 Store SQL:', sql)
    console.log('🏪 Store params:', params)

    const result = await query(sql, params)

    return result.rows.map((row: any) => ({
      storeCode: row.storeCode,
      storeName: row.storeName,
      regionCode: row.regionCode,
      regionName: row.regionName,
      cityName: row.cityName,
      orders: parseInt(row.orders) || 0,
      users: parseInt(row.users) || 0,
      sales: parseFloat(row.sales) || 0,
      discount: parseFloat(row.discount) || 0,
      netSales: parseFloat(row.net_sales) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0
    }))
  } catch (error) {
    console.error('❌ Error in getStorePerformance:', error)
    throw error
  }
}

/**
 * Get user/salesman performance from flat table
 */
export const getUserPerformance = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause } = buildWhereClause(filters, params)

    const sql = `
      SELECT
        trx_usercode as "userCode",
        MAX(COALESCE(user_description, trx_usercode)) as "userName",
        MAX(COALESCE(user_usertype, 'Salesman')) as "userType",
        MAX(route_salesmancode) as "teamLeaderCode",
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
        COUNT(DISTINCT customer_code) as stores,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
        COALESCE(SUM(trx_totaldiscountamount), 0) as discount,
        COALESCE(SUM(trx_totalamount), 0) as net_sales,
        COALESCE(SUM(trx_totalamount) / NULLIF(COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END), 0), 0) as avg_order_value
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY trx_usercode
      ORDER BY net_sales DESC
    `

    console.log('👤 User SQL:', sql)
    console.log('👤 User params:', params)

    const result = await query(sql, params)

    return result.rows.map((row: any) => ({
      userCode: row.userCode,
      userName: row.userName,
      userType: row.userType,
      teamLeaderCode: row.teamLeaderCode,
      orders: parseInt(row.orders) || 0,
      stores: parseInt(row.stores) || 0,
      sales: parseFloat(row.sales) || 0,
      discount: parseFloat(row.discount) || 0,
      netSales: parseFloat(row.net_sales) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0
    }))
  } catch (error) {
    console.error('❌ Error in getUserPerformance:', error)
    throw error
  }
}

/**
 * Get transaction details with pagination from flat table
 */
export const getTransactionDetails = async (filters: any = {}) => {
  try {
    const { startDate, endDate } = filters.startDate && filters.endDate
      ? { startDate: new Date(filters.startDate), endDate: new Date(filters.endDate) }
      : filters.dateRange
      ? getDateRangeFromString(filters.dateRange)
      : getDateRangeFromString('last7days')

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    const page = parseInt(filters.page) || 1
    const limit = Math.min(parseInt(filters.limit) || 50, 500)
    const offset = (page - 1) * limit

    const params: any[] = [startDateStr, endDateStr]
    const { whereClause, paramCount } = buildWhereClause(filters, params)

    // Count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM ${SALES_TABLE}
      ${whereClause}
    `

    // Data query with all required fields
    const countParams = [...params]
    params.push(limit, offset)

    const dataSql = `
      SELECT
        trx_trxcode as "trxCode",
        trx_trxdate as "trxDate",
        DATE(trx_trxdate) as "trxDateOnly",
        trx_usercode as "fieldUserCode",
        COALESCE(user_description, trx_usercode) as "fieldUserName",
        COALESCE(user_usertype, 'Field User') as "fieldUserRole",
        COALESCE(route_salesmancode, '') as "tlCode",
        COALESCE(route_salesmancode, '') as "tlName",
        COALESCE(route_areacode, '') as "regionCode",
        COALESCE(route_areacode, '') as "regionName",
        COALESCE(route_subareacode, '') as "cityCode",
        COALESCE(route_subareacode, '') as "cityName",
        customer_code as "storeCode",
        COALESCE(customer_description, customer_code) as "storeName",
        COALESCE(customer_channel_description, customer_channelcode, '') as "chainType",
        line_itemcode as "productCode",
        COALESCE(line_itemdescription, item_description, line_itemcode) as "productName",
        COALESCE(item_grouplevel1, '') as "productCategory",
        line_quantitybu as quantity,
        line_baseprice as "unitPrice",
        (line_baseprice * line_quantitybu) as "lineAmount",
        line_totaldiscountamount as "lineDiscount",
        COALESCE(trx_currencycode, 'AED') as "currencyCode",
        trx_routecode as "routeCode",
        route_name as "routeName"
      FROM ${SALES_TABLE}
      ${whereClause}
      ORDER BY trx_trxdate DESC, trx_trxcode
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `

    console.log('📋 Transaction SQL:', dataSql)
    console.log('📋 Transaction params:', params)

    const [countResult, dataResult] = await Promise.all([
      query(countSql, countParams),
      query(dataSql, params)
    ])

    const total = parseInt(countResult.rows[0]?.total || '0')
    const totalPages = Math.ceil(total / limit)

    return {
      transactions: dataResult.rows.map((row: any) => ({
        trxCode: row.trxCode,
        trxDate: row.trxDate,
        trxDateOnly: row.trxDateOnly,
        fieldUserCode: row.fieldUserCode || '',
        fieldUserName: row.fieldUserName || '',
        fieldUserRole: row.fieldUserRole || 'Field User',
        tlCode: row.tlCode || '',
        tlName: row.tlName || '',
        regionCode: row.regionCode || '',
        regionName: row.regionName || '',
        cityCode: row.cityCode || '',
        cityName: row.cityName || '',
        storeCode: row.storeCode,
        storeName: row.storeName,
        chainType: row.chainType,
        productCode: row.productCode,
        productName: row.productName,
        productCategory: row.productCategory,
        quantity: parseFloat(row.quantity) || 0,
        unitPrice: parseFloat(row.unitPrice) || 0,
        lineAmount: parseFloat(row.lineAmount) || 0,
        lineDiscount: parseFloat(row.lineDiscount) || 0,
        currencyCode: row.currencyCode,
        routeCode: row.routeCode || '',
        routeName: row.routeName || ''
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  } catch (error) {
    console.error('❌ Error in getTransactionDetails:', error)
    throw error
  }
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

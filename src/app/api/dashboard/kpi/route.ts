import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const current = new Date()
  let startDate: Date
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      startDate = new Date(current)
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
      break
    case 'last30Days':
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(current.getMonth() / 3)
      startDate = new Date(current.getFullYear(), quarter * 3, 1)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(current.getMonth() / 3) - 1
      startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
  }

  return {
    startDate,
    endDate
  }
}

// Internal function to fetch KPI data from real tblTrxHeader table
async function fetchKPIDataInternal(params: {
  dateRange: string
  regionCode: string | null
  cityCode: string | null
  teamLeaderCode: string | null
  warehouseCode: string | null
  routeCode: string | null
  userCode: string | null
  customerCode: string | null
  customStartDate: string | null
  customEndDate: string | null
}) {
  const {
    dateRange,
    regionCode,
    cityCode,
    teamLeaderCode,
    warehouseCode,
    routeCode,
    userCode,
    customerCode,
    customStartDate,
    customEndDate
  } = params

  const currentDate = new Date()

  // Get date range - prioritize custom dates if provided
  let startDate: Date, endDate: Date
  if (customStartDate && customEndDate) {
    startDate = new Date(customStartDate)
    endDate = new Date(customEndDate)
  } else {
    const dateRangeResult = getDateRangeFromString(dateRange)
    startDate = dateRangeResult.startDate
    endDate = dateRangeResult.endDate
  }

  // Build filter conditions using real tblTrxHeader columns
  const conditions: string[] = []
  const queryParams: any[] = []
  let paramIndex = 1

  // Date conditions - using TrxDate column
  conditions.push(`t."TrxDate" >= $${paramIndex}::timestamp`)
  queryParams.push(startDate.toISOString().split('T')[0])
  paramIndex++
  conditions.push(`t."TrxDate" < ($${paramIndex}::timestamp + INTERVAL '1 day')`)
  queryParams.push(endDate.toISOString().split('T')[0])
  paramIndex++

  // Only include invoices/sales (TrxType = 1)
  conditions.push(`t."TrxType" = 1`)

  // Build JOIN clauses for filters (more efficient than EXISTS subqueries)
  const joins: string[] = []

  // Region or City filter - join with tblCustomer once
  if (regionCode || cityCode) {
    joins.push(`INNER JOIN "tblCustomer" c ON t."ClientCode" = c."Code"`)
    if (regionCode) {
      conditions.push(`c."RegionCode" = $${paramIndex}`)
      queryParams.push(regionCode)
      paramIndex++
    }
    if (cityCode) {
      conditions.push(`c."CityCode" = $${paramIndex}`)
      queryParams.push(cityCode)
      paramIndex++
    }
  }

  // Team Leader filter - join with tblUser
  if (teamLeaderCode) {
    joins.push(`INNER JOIN "tblUser" u ON t."UserCode" = u."Code"`)
    conditions.push(`u."ReportsTo" = $${paramIndex}`)
    queryParams.push(teamLeaderCode)
    paramIndex++
  }

  // Route filter
  if (routeCode) {
    conditions.push(`t."RouteCode" = $${paramIndex}`)
    queryParams.push(routeCode)
    paramIndex++
  }

  // User/Salesman filter
  if (userCode) {
    conditions.push(`t."UserCode" = $${paramIndex}`)
    queryParams.push(userCode)
    paramIndex++
  }

  // Customer filter
  if (customerCode) {
    conditions.push(`t."ClientCode" = $${paramIndex}`)
    queryParams.push(customerCode)
    paramIndex++
  }

  // Warehouse filter (via route or org)
  if (warehouseCode) {
    conditions.push(`t."OrgCode" = $${paramIndex}`)
    queryParams.push(warehouseCode)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const joinClause = joins.length > 0 ? joins.join(' ') : ''

  // Build optimized KPI query using real tblTrxHeader table with quantity from tblTrxDetail
  const buildKPIQuery = (joinClause: string, whereClause: string) => `
    SELECT
      COALESCE(SUM(CASE WHEN t."TotalAmount" >= 0 THEN t."TotalAmount" ELSE 0 END), 0) as total_sales,
      COALESCE(SUM(CASE WHEN t."TotalAmount" < 0 THEN ABS(t."TotalAmount") ELSE 0 END), 0) as return_sales,
      COALESCE(SUM(t."TotalAmount"), 0) as net_sales,
      COUNT(DISTINCT CASE WHEN t."TotalAmount" >= 0 THEN t."TrxCode" END) as total_orders,
      COUNT(DISTINCT CASE WHEN t."TotalAmount" < 0 THEN t."TrxCode" END) as return_orders,
      COUNT(DISTINCT t."ClientCode") as unique_customers,
      COUNT(DISTINCT t."UserCode") as unique_salesmen,
      COALESCE(MAX(t."CurrencyCode"), 'AED') as currency_code,
      COUNT(*) as total_records,
      COALESCE((
        SELECT SUM(ABS(COALESCE(d."QuantityBU", 0)))
        FROM "tblTrxDetail" d
        INNER JOIN "tblTrxHeader" th ON d."TrxCode" = th."TrxCode"
        ${joinClause.replace(/t\./g, 'th.')}
        ${whereClause.replace(/t\./g, 'th.')}
      ), 0) as total_quantity
    FROM "tblTrxHeader" t
    ${joinClause}
    ${whereClause}
  `

  // Execute current period query
  const currentResult = await query(buildKPIQuery(joinClause, whereClause), queryParams)
  const current = currentResult.rows[0] || {}

  const currentTotalSales = parseFloat(current.total_sales || '0')
  const currentReturnSales = parseFloat(current.return_sales || '0')
  const currentNetSales = parseFloat(current.net_sales || '0')
  const currentTotalOrders = parseInt(current.total_orders || '0')
  const currentReturnOrders = parseInt(current.return_orders || '0')
  const currentNetOrders = currentTotalOrders - currentReturnOrders
  const currentUniqueCustomers = parseInt(current.unique_customers || '0')
  const currentUniqueSalesmen = parseInt(current.unique_salesmen || '0')
  const currentCurrencyCode = current.currency_code || 'AED'
  const currentAvgOrder = currentNetOrders > 0 ? currentNetSales / currentNetOrders : 0
  const totalRecords = parseInt(current.total_records || '0')
  const currentTotalQuantity = parseFloat(current.total_quantity || '0')

  // Previous period stats
  const periodLength = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1
  const prevStartDate = new Date(startDate)
  prevStartDate.setDate(prevStartDate.getDate() - periodLength)
  const prevEndDate = new Date(startDate)
  prevEndDate.setDate(prevEndDate.getDate() - 1)

  const prevConditions: string[] = []
  const prevParams: any[] = []
  let prevParamIndex = 1

  prevConditions.push(`t."TrxDate" >= $${prevParamIndex}::timestamp`)
  prevParams.push(prevStartDate.toISOString().split('T')[0])
  prevParamIndex++
  prevConditions.push(`t."TrxDate" < ($${prevParamIndex}::timestamp + INTERVAL '1 day')`)
  prevParams.push(prevEndDate.toISOString().split('T')[0])
  prevParamIndex++
  prevConditions.push(`t."TrxType" = 1`)

  // Build JOIN clauses for previous period - same as current period
  const prevJoins: string[] = []

  // Region or City filter
  if (regionCode || cityCode) {
    prevJoins.push(`INNER JOIN "tblCustomer" c ON t."ClientCode" = c."Code"`)
    if (regionCode) {
      prevConditions.push(`c."RegionCode" = $${prevParamIndex}`)
      prevParams.push(regionCode)
      prevParamIndex++
    }
    if (cityCode) {
      prevConditions.push(`c."CityCode" = $${prevParamIndex}`)
      prevParams.push(cityCode)
      prevParamIndex++
    }
  }

  // Team Leader filter
  if (teamLeaderCode) {
    prevJoins.push(`INNER JOIN "tblUser" u ON t."UserCode" = u."Code"`)
    prevConditions.push(`u."ReportsTo" = $${prevParamIndex}`)
    prevParams.push(teamLeaderCode)
    prevParamIndex++
  }

  if (routeCode) { prevConditions.push(`t."RouteCode" = $${prevParamIndex}`); prevParams.push(routeCode); prevParamIndex++ }
  if (userCode) { prevConditions.push(`t."UserCode" = $${prevParamIndex}`); prevParams.push(userCode); prevParamIndex++ }
  if (customerCode) { prevConditions.push(`t."ClientCode" = $${prevParamIndex}`); prevParams.push(customerCode); prevParamIndex++ }
  if (warehouseCode) { prevConditions.push(`t."OrgCode" = $${prevParamIndex}`); prevParams.push(warehouseCode); prevParamIndex++ }

  const prevWhereClause = `WHERE ${prevConditions.join(' AND ')}`
  const prevJoinClause = prevJoins.length > 0 ? prevJoins.join(' ') : ''
  const prevResult = await query(buildKPIQuery(prevJoinClause, prevWhereClause), prevParams)

  const prev = prevResult.rows[0] || {}
  const prevNetSales = parseFloat(prev.net_sales || '0')
  const prevTotalOrders = parseInt(prev.total_orders || '0')
  const prevReturnOrders = parseInt(prev.return_orders || '0')
  const prevNetOrders = prevTotalOrders - prevReturnOrders
  const prevUniqueCustomers = parseInt(prev.unique_customers || '0')
  const prevTotalQuantity = parseFloat(prev.total_quantity || '0')

  // Calculate changes
  const netSalesChange = prevNetSales > 0 ? ((currentNetSales - prevNetSales) / prevNetSales * 100) : (currentNetSales > 0 ? 100 : 0)
  const netOrdersChange = prevNetOrders > 0 ? ((currentNetOrders - prevNetOrders) / prevNetOrders * 100) : (currentNetOrders > 0 ? 100 : 0)
  const uniqueCustomersChange = prevUniqueCustomers > 0 ? ((currentUniqueCustomers - prevUniqueCustomers) / prevUniqueCustomers * 100) : (currentUniqueCustomers > 0 ? 100 : 0)
  const prevAvgOrder = prevNetOrders > 0 ? prevNetSales / prevNetOrders : 0
  const avgOrderChange = prevAvgOrder > 0 ? ((currentAvgOrder - prevAvgOrder) / prevAvgOrder * 100) : 0
  const unitsChange = prevTotalQuantity > 0 ? ((currentTotalQuantity - prevTotalQuantity) / prevTotalQuantity * 100) : (currentTotalQuantity > 0 ? 100 : 0)

  // MTD calculations
  const mtdStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const mtdQuery = `
    SELECT COALESCE(SUM("TotalAmount"), 0) as net_sales
    FROM "tblTrxHeader"
    WHERE "TrxDate" >= $1::timestamp
    AND "TrxDate" < ($2::timestamp + INTERVAL '1 day')
    AND "TrxType" = 1
  `
  const mtdResult = await query(mtdQuery, [
    mtdStartDate.toISOString().split('T')[0],
    currentDate.toISOString().split('T')[0]
  ])
  const mtdSales = parseFloat(mtdResult.rows[0]?.net_sales || '0')

  // YTD calculations
  const ytdStartDate = new Date(currentDate.getFullYear(), 0, 1)
  const ytdResult = await query(mtdQuery, [
    ytdStartDate.toISOString().split('T')[0],
    currentDate.toISOString().split('T')[0]
  ])
  const ytdSales = parseFloat(ytdResult.rows[0]?.net_sales || '0')

  return {
    currentTotalSales,
    currentReturnSales,
    currentNetSales,
    currentSales: currentNetSales,
    currentTotalOrders,
    currentReturnOrders,
    currentNetOrders,
    currentOrders: currentNetOrders,
    currentUniqueCustomers,
    currentCustomers: currentUniqueCustomers,
    currentUniqueSalesmen,
    currentTotalQuantity,
    totalQuantity: currentTotalQuantity,
    // Add aliases expected by DynamicKPICards component
    currentUnits: currentTotalQuantity,
    todayUnits: currentTotalQuantity,
    unitsChange,
    prevNetSales,
    prevNetOrders,
    prevUniqueCustomers,
    averageOrderValue: currentAvgOrder,
    avgOrderChange,
    netSalesChange,
    netOrdersChange,
    uniqueCustomersChange,
    todayOrders: currentNetOrders,
    todayCustomers: currentUniqueCustomers,
    todaySales: currentNetSales,
    growthPercentage: netSalesChange,
    salesChange: netSalesChange,
    ordersChange: netOrdersChange,
    customersChange: uniqueCustomersChange,
    conversionRate: currentUniqueCustomers > 0 ? (currentNetOrders / currentUniqueCustomers * 100) : 0,
    mtdSales,
    ytdSales,
    currencyCode: currentCurrencyCode,
    currencySymbol: 'AED',
    debug: {
      totalRecords,
      dateRange,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      appliedFilters: {
        regionCode,
        cityCode,
        teamLeaderCode,
        warehouseCode,
        routeCode,
        userCode,
        customerCode
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const warehouseCode = searchParams.get('warehouseCode') || searchParams.get('depotCode')
    const routeCode = searchParams.get('routeCode')
    const userCode = searchParams.get('userCode') || searchParams.get('salesmanCode')
    const customerCode = searchParams.get('customerCode') || searchParams.get('storeCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    const filterParams = {
      dateRange,
      regionCode,
      cityCode,
      teamLeaderCode,
      warehouseCode,
      routeCode,
      userCode,
      customerCode,
      customStartDate,
      customEndDate
    }

    const kpiData = await fetchKPIDataInternal(filterParams)

    return NextResponse.json({
      success: true,
      data: kpiData,
      timestamp: new Date().toISOString(),
      source: 'postgresql-tblTrxHeader'
    })

  } catch (error) {
    console.error('KPI API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard KPIs',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

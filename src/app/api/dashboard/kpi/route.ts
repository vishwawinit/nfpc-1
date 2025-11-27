import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Enable caching with revalidation based on Cache-Control headers
export const dynamic = 'auto'
export const revalidate = 300 // Fallback: 5 minutes

const SALES_TABLE = 'flat_daily_sales_report'

// Helper to convert Date to YYYY-MM-DD string in local timezone (no UTC conversion)
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper function to parse date range string (UTC-safe)
const getDateRangeFromString = (dateRange: string) => {
  // Get current date in local timezone, extract components
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
      // This month: 1st day to TODAY (inclusive)
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastMonth':
      // Last month: 1st to last day of previous month
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
      break
    case 'thisQuarter':
      // This quarter: 1st day of quarter to TODAY (inclusive)
      const quarter = Math.floor(month / 3)
      startDate = new Date(year, quarter * 3, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastQuarter':
      // Last quarter: 1st to last day of previous quarter
      const lastQuarter = Math.floor(month / 3) - 1
      startDate = new Date(year, lastQuarter * 3, 1)
      endDate = new Date(year, lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      // This year: Jan 1 to TODAY (inclusive)
      startDate = new Date(year, 0, 1)
      endDate = new Date(year, month, day)
      break
    default:
      startDate = new Date(year, month, day - 29)
      endDate = new Date(year, month, day)
  }

  return { startDate, endDate }
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

  // Area filter (support both old regionCode and new areaCode)
  if (params.areaCode || params.regionCode) {
    conditions.push(`route_areacode = '${params.areaCode || params.regionCode}'`)
  }

  // Sub Area filter (support both old cityCode and new subAreaCode)
  if (params.subAreaCode || params.cityCode) {
    conditions.push(`route_subareacode = '${params.subAreaCode || params.cityCode}'`)
  }

  // Route filter
  if (params.routeCode) {
    conditions.push(`trx_routecode = '${params.routeCode}'`)
  }

  // User filter
  if (params.userCode) {
    conditions.push(`trx_usercode = '${params.userCode}'`)
  }

  // Customer filter
  if (params.customerCode) {
    conditions.push(`customer_code = '${params.customerCode}'`)
  }

  // Team leader filter
  if (params.teamLeaderCode) {
    conditions.push(`route_salesmancode = '${params.teamLeaderCode}'`)
  }

  // Channel filter
  if (params.chainName) {
    conditions.push(`customer_channel_description = '${params.chainName}'`)
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

// Fetch KPI data from flat_daily_sales_report
async function fetchKPIDataInternal(params: {
  dateRange: string
  regionCode: string | null
  cityCode: string | null
  teamLeaderCode: string | null
  routeCode: string | null
  userCode: string | null
  customerCode: string | null
  chainName: string | null
  customStartDate: string | null
  customEndDate: string | null
}) {
  const currentDate = new Date()

  // Get date range
  let startDate: Date, endDate: Date
  if (params.customStartDate && params.customEndDate) {
    startDate = new Date(params.customStartDate)
    endDate = new Date(params.customEndDate)
  } else {
    const dateRangeResult = getDateRangeFromString(params.dateRange)
    startDate = dateRangeResult.startDate
    endDate = dateRangeResult.endDate
  }

  const filterParams = {
    ...params,
    startDate: toLocalDateString(startDate),
    endDate: toLocalDateString(endDate)
  }

  const whereClause = buildWhereClause(filterParams)

  // Calculate previous period dates (UTC-safe)
  const periodLength = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1
  const prevStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - periodLength)
  const prevEndDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1)

  // OPTIMIZED: Single query for both current and previous periods using CASE statements
  const optimizedKpiQuery = `
    SELECT
      -- Current period metrics
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        AND trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as current_total_sales,
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        AND trx_totalamount < 0 THEN ABS(trx_totalamount) ELSE 0 END), 0) as current_return_sales,
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        THEN trx_totalamount ELSE 0 END), 0) as current_net_sales,
      COUNT(DISTINCT CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        AND trx_totalamount >= 0 THEN trx_trxcode END) as current_total_orders,
      COUNT(DISTINCT CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        THEN customer_code END) as current_unique_customers,
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${filterParams.startDate}'::timestamp
        AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day')
        THEN ABS(line_quantitybu) ELSE 0 END), 0) as current_total_quantity,

      -- Previous period metrics
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${toLocalDateString(prevStartDate)}'::timestamp
        AND trx_trxdate < ('${toLocalDateString(prevEndDate)}'::timestamp + INTERVAL '1 day')
        THEN trx_totalamount ELSE 0 END), 0) as prev_net_sales,
      COUNT(DISTINCT CASE
        WHEN trx_trxdate >= '${toLocalDateString(prevStartDate)}'::timestamp
        AND trx_trxdate < ('${toLocalDateString(prevEndDate)}'::timestamp + INTERVAL '1 day')
        AND trx_totalamount >= 0 THEN trx_trxcode END) as prev_total_orders,
      COUNT(DISTINCT CASE
        WHEN trx_trxdate >= '${toLocalDateString(prevStartDate)}'::timestamp
        AND trx_trxdate < ('${toLocalDateString(prevEndDate)}'::timestamp + INTERVAL '1 day')
        THEN customer_code END) as prev_unique_customers,
      COALESCE(SUM(CASE
        WHEN trx_trxdate >= '${toLocalDateString(prevStartDate)}'::timestamp
        AND trx_trxdate < ('${toLocalDateString(prevEndDate)}'::timestamp + INTERVAL '1 day')
        THEN ABS(line_quantitybu) ELSE 0 END), 0) as prev_total_quantity,

      COALESCE(MAX(trx_currencycode), 'AED') as currency_code
    FROM ${SALES_TABLE}
    WHERE trx_trxtype = 1
      AND (trx_trxdate >= '${toLocalDateString(prevStartDate)}'::timestamp
      AND trx_trxdate < ('${filterParams.endDate}'::timestamp + INTERVAL '1 day'))
      ${whereClause.replace('WHERE trx_trxtype = 1', '').replace('WHERE', 'AND')}
  `

  // Execute optimized single query
  const result = await query(optimizedKpiQuery)
  const data = result.rows[0] || {}

  // Current period values
  const currentTotalSales = parseFloat(data.current_total_sales || '0')
  const currentReturnSales = parseFloat(data.current_return_sales || '0')
  const currentNetSales = parseFloat(data.current_net_sales || '0')
  const currentTotalOrders = parseInt(data.current_total_orders || '0')
  const currentReturnOrders = 0 // Return orders not separately tracked in optimized query
  const currentNetOrders = currentTotalOrders
  const currentUniqueCustomers = parseInt(data.current_unique_customers || '0')
  const currentUniqueSalesmen = 0 // Salesmen count not tracked in optimized query
  const currentTotalQuantity = parseFloat(data.current_total_quantity || '0')
  const currentCurrencyCode = data.currency_code || 'AED'
  const currentAvgOrder = currentNetOrders > 0 ? currentNetSales / currentNetOrders : 0

  // Previous period values
  const prevNetSales = parseFloat(data.prev_net_sales || '0')
  const prevTotalOrders = parseInt(data.prev_total_orders || '0')
  const prevNetOrders = prevTotalOrders
  const prevUniqueCustomers = parseInt(data.prev_unique_customers || '0')
  const prevTotalQuantity = parseFloat(data.prev_total_quantity || '0')
  const prevAvgOrder = prevNetOrders > 0 ? prevNetSales / prevNetOrders : 0

  // Calculate changes
  const netSalesChange = prevNetSales > 0 ? ((currentNetSales - prevNetSales) / prevNetSales * 100) : (currentNetSales > 0 ? 100 : 0)
  const netOrdersChange = prevNetOrders > 0 ? ((currentNetOrders - prevNetOrders) / prevNetOrders * 100) : (currentNetOrders > 0 ? 100 : 0)
  const uniqueCustomersChange = prevUniqueCustomers > 0 ? ((currentUniqueCustomers - prevUniqueCustomers) / prevUniqueCustomers * 100) : (currentUniqueCustomers > 0 ? 100 : 0)
  const avgOrderChange = prevAvgOrder > 0 ? ((currentAvgOrder - prevAvgOrder) / prevAvgOrder * 100) : 0
  const unitsChange = prevTotalQuantity > 0 ? ((currentTotalQuantity - prevTotalQuantity) / prevTotalQuantity * 100) : (currentTotalQuantity > 0 ? 100 : 0)

  // MTD/YTD calculations (simplified - set to 0 for optimization)
  const mtdSales = 0
  const ytdSales = 0

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
      optimizedQuery: true,
      dateRange: params.dateRange,
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      prevStartDate: toLocalDateString(prevStartDate),
      prevEndDate: toLocalDateString(prevEndDate),
      appliedFilters: {
        regionCode: params.regionCode,
        cityCode: params.cityCode,
        teamLeaderCode: params.teamLeaderCode,
        routeCode: params.routeCode,
        userCode: params.userCode,
        customerCode: params.customerCode,
        chainName: params.chainName
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'

    const filterParams = {
      dateRange,
      areaCode: searchParams.get('areaCode') || searchParams.get('regionCode'),
      subAreaCode: searchParams.get('subAreaCode') || searchParams.get('cityCode'),
      regionCode: searchParams.get('regionCode'), // Keep for backward compatibility in WHERE clause
      cityCode: searchParams.get('cityCode'), // Keep for backward compatibility in WHERE clause
      teamLeaderCode: searchParams.get('teamLeaderCode'),
      routeCode: searchParams.get('routeCode'),
      userCode: searchParams.get('userCode') || searchParams.get('salesmanCode'),
      customerCode: searchParams.get('customerCode') || searchParams.get('storeCode'),
      chainName: searchParams.get('chainName'),
      customStartDate: searchParams.get('startDate'),
      customEndDate: searchParams.get('endDate')
    }

    const kpiData = await fetchKPIDataInternal(filterParams)

    return NextResponse.json({
      success: true,
      data: kpiData,
      timestamp: new Date().toISOString(),
      source: 'flat_daily_sales_report'
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

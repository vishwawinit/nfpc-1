import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

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

  // Region filter
  if (params.regionCode) {
    conditions.push(`customer_regioncode = '${params.regionCode}'`)
  }

  // City filter
  if (params.cityCode) {
    conditions.push(`(customer_citycode = '${params.cityCode}' OR city_description = '${params.cityCode}')`)
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
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }

  const whereClause = buildWhereClause(filterParams)

  // Build KPI query for current period
  const kpiQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as total_sales,
      COALESCE(SUM(CASE WHEN trx_totalamount < 0 THEN ABS(trx_totalamount) ELSE 0 END), 0) as return_sales,
      COALESCE(SUM(trx_totalamount), 0) as net_sales,
      COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as total_orders,
      COUNT(DISTINCT CASE WHEN trx_totalamount < 0 THEN trx_trxcode END) as return_orders,
      COUNT(DISTINCT customer_code) as unique_customers,
      COUNT(DISTINCT trx_usercode) as unique_salesmen,
      COALESCE(SUM(ABS(line_quantitybu)), 0) as total_quantity,
      COALESCE(MAX(trx_currencycode), 'AED') as currency_code,
      COUNT(*) as total_records
    FROM ${SALES_TABLE}
    ${whereClause}
  `

  // Execute current period query
  const currentResult = await query(kpiQuery)
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
  const currentTotalQuantity = parseFloat(current.total_quantity || '0')
  const totalRecords = parseInt(current.total_records || '0')

  // Previous period stats
  const periodLength = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1
  const prevStartDate = new Date(startDate)
  prevStartDate.setDate(prevStartDate.getDate() - periodLength)
  const prevEndDate = new Date(startDate)
  prevEndDate.setDate(prevEndDate.getDate() - 1)

  const prevFilterParams = {
    ...params,
    startDate: prevStartDate.toISOString().split('T')[0],
    endDate: prevEndDate.toISOString().split('T')[0]
  }

  const prevWhereClause = buildWhereClause(prevFilterParams)
  const prevResult = await query(kpiQuery.replace(whereClause, prevWhereClause))

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
    SELECT COALESCE(SUM(trx_totalamount), 0) as net_sales
    FROM ${SALES_TABLE}
    WHERE trx_trxdate >= '${mtdStartDate.toISOString().split('T')[0]}'::timestamp
    AND trx_trxdate < ('${currentDate.toISOString().split('T')[0]}'::timestamp + INTERVAL '1 day')
    AND trx_trxtype = 1
  `
  const mtdResult = await query(mtdQuery)
  const mtdSales = parseFloat(mtdResult.rows[0]?.net_sales || '0')

  // YTD calculations
  const ytdStartDate = new Date(currentDate.getFullYear(), 0, 1)
  const ytdQuery = `
    SELECT COALESCE(SUM(trx_totalamount), 0) as net_sales
    FROM ${SALES_TABLE}
    WHERE trx_trxdate >= '${ytdStartDate.toISOString().split('T')[0]}'::timestamp
    AND trx_trxdate < ('${currentDate.toISOString().split('T')[0]}'::timestamp + INTERVAL '1 day')
    AND trx_trxtype = 1
  `
  const ytdResult = await query(ytdQuery)
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
      dateRange: params.dateRange,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
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
      regionCode: searchParams.get('regionCode'),
      cityCode: searchParams.get('cityCode'),
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

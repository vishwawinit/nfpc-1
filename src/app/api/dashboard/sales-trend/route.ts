import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  if (!dateRange || dateRange.trim() === '') {
    const current = new Date()
    const startDate = new Date(current)
    startDate.setDate(startDate.getDate() - 29)
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: current.toISOString().split('T')[0]
    }
  }

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
    case 'custom':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }
}

// Internal function to fetch sales trend data from real tblTrxHeader
async function fetchSalesTrendInternal(params: {
  days: number
  dateRange: string
  routeCode: string | null
  userCode: string | null
  customerCode: string | null
  warehouseCode: string | null
  customStartDate: string | null
  customEndDate: string | null
}) {
  const {
    days,
    dateRange,
    routeCode,
    userCode,
    customerCode,
    warehouseCode,
    customStartDate,
    customEndDate
  } = params

  // Determine date range
  let startDate: string, endDate: string
  if (customStartDate && customEndDate) {
    startDate = customStartDate
    endDate = customEndDate
  } else {
    const rangeToUse = dateRange || 'last30Days'
    const dateRangeResult = getDateRangeFromString(rangeToUse)
    startDate = dateRangeResult.startDate
    endDate = dateRangeResult.endDate
  }

  // Build WHERE conditions using real tblTrxHeader columns
  const conditions: string[] = []
  const queryParams: any[] = []
  let paramIndex = 1

  // Date filtering
  conditions.push(`t."TrxDate" >= $${paramIndex}::timestamp`)
  queryParams.push(startDate)
  paramIndex++
  conditions.push(`t."TrxDate" < ($${paramIndex}::timestamp + INTERVAL '1 day')`)
  queryParams.push(endDate)
  paramIndex++

  // Only invoices/sales (TrxType = 1)
  conditions.push(`t."TrxType" = 1`)

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

  // Warehouse/Org filter
  if (warehouseCode) {
    conditions.push(`t."OrgCode" = $${paramIndex}`)
    queryParams.push(warehouseCode)
    paramIndex++
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  // Calculate day span for aggregation
  const start = new Date(startDate)
  const end = new Date(endDate)
  const msInDay = 24 * 60 * 60 * 1000
  const daySpan = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msInDay) + 1)

  // Determine grouping based on date span
  let dateGrouping: string
  let orderBy: string

  if (daySpan <= 14) {
    dateGrouping = `DATE(t."TrxDate")`
    orderBy = `DATE(t."TrxDate")`
  } else if (daySpan <= 92) {
    dateGrouping = `DATE_TRUNC('week', t."TrxDate")`
    orderBy = `DATE_TRUNC('week', t."TrxDate")`
  } else {
    dateGrouping = `DATE_TRUNC('month', t."TrxDate")`
    orderBy = `DATE_TRUNC('month', t."TrxDate")`
  }

  // Sales trend query using real tblTrxHeader
  const result = await query(`
    SELECT
      ${dateGrouping}::date as date,
      COALESCE(SUM(CASE WHEN t."TotalAmount" > 0 THEN t."TotalAmount" ELSE 0 END), 0)::numeric(15,2) as sales,
      COUNT(DISTINCT CASE WHEN t."TotalAmount" > 0 THEN t."TrxCode" END) as orders,
      COUNT(DISTINCT CASE WHEN t."TotalAmount" > 0 THEN t."ClientCode" END) as customers,
      COUNT(DISTINCT t."UserCode") as salesmen,
      COALESCE(ABS(SUM(CASE WHEN t."TotalAmount" < 0 THEN t."TotalAmount" ELSE 0 END)), 0)::numeric(15,2) as returns
    FROM "tblTrxHeader" t
    ${whereClause}
    GROUP BY ${dateGrouping}
    ORDER BY ${orderBy} ASC
  `, queryParams)

  const trendData = result.rows.map(row => ({
    date: row.date,
    sales: parseFloat(row.sales || '0'),
    orders: parseInt(row.orders || '0'),
    customers: parseInt(row.customers || '0'),
    salesmen: parseInt(row.salesmen || '0'),
    returns: parseFloat(row.returns || '0')
  }))

  // Determine aggregation type for frontend
  let aggregation = 'daily'
  if (daySpan > 365) {
    aggregation = 'monthly'
  } else if (daySpan > 92) {
    aggregation = 'weekly'
  }

  return {
    data: trendData,
    dateRange: customStartDate && customEndDate ? 'custom' : (dateRange || 'last30Days'),
    aggregation,
    days,
    startDate,
    endDate
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const days = parseInt(searchParams.get('days') || '30')
    const dateRange = searchParams.get('range') || ''

    // Get filter parameters
    const routeCode = searchParams.get('routeCode')
    const userCode = searchParams.get('userCode') || searchParams.get('salesmanCode')
    const customerCode = searchParams.get('customerCode') || searchParams.get('storeCode')
    const warehouseCode = searchParams.get('warehouseCode') || searchParams.get('depotCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    const rangeToUse = dateRange || 'last30Days'

    const trendData = await fetchSalesTrendInternal({
      days,
      dateRange: rangeToUse,
      routeCode,
      userCode,
      customerCode,
      warehouseCode,
      customStartDate,
      customEndDate
    })

    return NextResponse.json({
      success: true,
      ...trendData,
      currentDate: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      source: 'postgresql-tblTrxHeader'
    })

  } catch (error) {
    console.error('Sales trend API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch sales trend data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

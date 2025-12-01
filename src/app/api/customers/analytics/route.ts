import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const current = new Date()
  let startDate: Date = new Date(current)
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      break
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'thisWeek':
    case 'last7Days':
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
      startDate.setDate(startDate.getDate() - 29)
  }

  return { start: startDate, end: endDate }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Check cache first
    const cachedData = apiCache.get('/api/customers/analytics', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const dateRange = searchParams.get('range') || 'thisMonth'

    // Get filter parameters
    const routeCode = searchParams.get('routeCode')
    const userCode = searchParams.get('userCode') || searchParams.get('salesmanCode')
    const customerCode = searchParams.get('customerCode')
    const channelCode = searchParams.get('channelCode')

    const { start: startDate, end: endDate } = getDateRangeFromString(dateRange)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Build filter conditions using flat_daily_sales_report table
    const conditions: string[] = [
      `trx_trxdate::date >= $1::date`,
      `trx_trxdate::date <= $2::date`,
      `trx_trxtype = '1'`
    ]
    const params: any[] = [startDateStr, endDateStr]
    let paramIndex = 3

    if (routeCode) {
      conditions.push(`trx_routecode = $${paramIndex}`)
      params.push(routeCode)
      paramIndex++
    }

    if (userCode) {
      conditions.push(`trx_usercode = $${paramIndex}`)
      params.push(userCode)
      paramIndex++
    }

    if (customerCode) {
      conditions.push(`customer_code = $${paramIndex}`)
      params.push(customerCode)
      paramIndex++
    }

    if (channelCode) {
      conditions.push(`route_areacode = $${paramIndex}`)
      params.push(channelCode)
      paramIndex++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Get customer summary from flat_daily_sales_report table
    // Use same logic as details route to handle duplicate transaction amounts
    const customerSummaryQuery = `
      SELECT
        customer_code,
        MAX(customer_description) as customer_name,
        MAX(route_areacode) as region,
        MAX(trx_routecode) as route_code,
        MAX(customer_channelcode) as channel_code,
        'Active' as status,
        COALESCE(SUM(transaction_total), 0) as total_sales,
        COUNT(DISTINCT trx_trxcode) as total_orders,
        CASE
          WHEN COUNT(DISTINCT trx_trxcode) > 0
          THEN COALESCE(SUM(transaction_total), 0) / COUNT(DISTINCT trx_trxcode)
          ELSE 0
        END as avg_order_value,
        MAX(trx_currencycode) as currency_code,
        MAX(trx_trxdate::date) as last_order_date
      FROM (
        SELECT DISTINCT ON (customer_code, trx_trxcode)
          customer_code,
          customer_description,
          route_areacode,
          trx_routecode,
          customer_channelcode,
          trx_currencycode,
          trx_trxcode,
          trx_trxdate,
          trx_totalamount as transaction_total
        FROM flat_daily_sales_report
        ${whereClause}
      ) AS distinct_transactions
      GROUP BY customer_code
      ORDER BY total_sales DESC
    `

    const customerResult = await query(customerSummaryQuery, params)
    const customers = customerResult.rows

    // Calculate overall metrics
    const totalCustomers = customers.length
    const activeCustomers = customers.filter(c => c.status === 'Active').length
    const totalSales = customers.reduce((sum, c) => sum + parseFloat(c.total_sales || '0'), 0)
    const totalOrders = customers.reduce((sum, c) => sum + parseInt(c.total_orders || '0'), 0)
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

    // Region analysis
    const regionData = customers.reduce((acc: any, customer) => {
      const region = customer.region || 'Unknown'
      if (!acc[region]) {
        acc[region] = { customers: 0, sales: 0, orders: 0 }
      }
      acc[region].customers++
      acc[region].sales += parseFloat(customer.total_sales || '0')
      acc[region].orders += parseInt(customer.total_orders || '0')
      return acc
    }, {})

    const regionAnalysis = Object.entries(regionData).map(([region, data]: [string, any]) => ({
      region,
      customers: data.customers,
      sales: data.sales,
      orders: data.orders,
      contribution: totalSales > 0 ? (data.sales / totalSales * 100) : 0,
      avgSales: data.customers > 0 ? data.sales / data.customers : 0
    })).sort((a, b) => b.sales - a.sales)

    // Channel analysis
    const channelData = customers.reduce((acc: any, customer) => {
      const channel = customer.channel_code || 'Unknown'
      if (!acc[channel]) {
        acc[channel] = { customers: 0, sales: 0, orders: 0 }
      }
      acc[channel].customers++
      acc[channel].sales += parseFloat(customer.total_sales || '0')
      acc[channel].orders += parseInt(customer.total_orders || '0')
      return acc
    }, {})

    const channelCodeAnalysis = Object.entries(channelData).map(([channelCode, data]: [string, any]) => ({
      channelCode,
      customers: data.customers,
      sales: data.sales,
      orders: data.orders,
      contribution: totalSales > 0 ? (data.sales / totalSales * 100) : 0
    })).sort((a, b) => b.sales - a.sales)

    const responseData = {
      success: true,
      data: {
        metrics: {
          totalCustomers,
          activeCustomers,
          totalSales,
          totalOrders,
          avgOrderValue,
          currencyCode: 'AED'
        },
        regionAnalysis,
        channelCodeAnalysis,
        customers: customers.map(c => ({
          customerCode: c.customer_code,
          customerName: c.customer_name,
          region: c.region,
          channelCode: c.channel_code,
          totalSales: parseFloat(c.total_sales || '0'),
          totalOrders: parseInt(c.total_orders || '0'),
          avgOrderValue: parseFloat(c.avg_order_value || '0'),
          lastOrderDate: c.last_order_date
        }))
      },
      timestamp: new Date().toISOString(),
      source: 'postgresql-real-tables'
    }

    // Store in cache
    apiCache.set('/api/customers/analytics', responseData, searchParams)

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Customer analytics API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch customer analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
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

  return { start: startDate, end: endDate }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const sortByParam = searchParams.get('sortBy') || 'total_sales'
    const sortOrder = searchParams.get('sortOrder') || 'DESC'
    const search = searchParams.get('search') || ''

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const salesmanCode = searchParams.get('salesmanCode')
    const routeCode = searchParams.get('routeCode')
    const customerCode = searchParams.get('customerCode')
    const channelCode = searchParams.get('channelCode')

    const { start: startDate, end: endDate } = getDateRangeFromString(dateRange)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Build filter conditions using flat_daily_sales_report
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Always filter by transaction type = 1 (sales/invoices only)
    conditions.push(`trx_trxtype = '1'`)

    // Date conditions
    conditions.push(`trx_trxdate::date >= $${paramIndex}::date`)
    params.push(startDateStr)
    paramIndex++
    conditions.push(`trx_trxdate::date <= $${paramIndex}::date`)
    params.push(endDateStr)
    paramIndex++

    // Search condition
    if (search) {
      conditions.push(`(customer_description ILIKE $${paramIndex} OR customer_code ILIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    // Region/Area filter
    if (regionCode) {
      conditions.push(`route_areacode = $${paramIndex}`)
      params.push(regionCode)
      paramIndex++
    }

    // Salesman filter
    if (salesmanCode) {
      conditions.push(`trx_usercode = $${paramIndex}`)
      params.push(salesmanCode)
      paramIndex++
    }

    // Route filter
    if (routeCode) {
      conditions.push(`trx_routecode = $${paramIndex}`)
      params.push(routeCode)
      paramIndex++
    }

    // Customer filter
    if (customerCode) {
      conditions.push(`customer_code = $${paramIndex}`)
      params.push(customerCode)
      paramIndex++
    }

    // Channel filter
    if (channelCode) {
      conditions.push(`customer_channel_description = $${paramIndex}`)
      params.push(channelCode)
      paramIndex++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Calculate offset for pagination
    const offset = (page - 1) * limit

    // Map sort field to proper expression
    let orderByClause = ''
    if (sortByParam === 'total_sales') {
      orderByClause = `total_sales ${sortOrder}`
    } else if (sortByParam === 'total_orders') {
      orderByClause = `total_orders ${sortOrder}`
    } else if (sortByParam === 'avg_order_value') {
      orderByClause = `avg_order_value ${sortOrder}`
    } else if (sortByParam === 'customer_name') {
      orderByClause = `customer_name ${sortOrder}`
    } else {
      orderByClause = `total_sales ${sortOrder}`
    }

    // Get customer details with pagination using flat_daily_sales_report
    // IMPORTANT: trx_totalamount is repeated on every line item of a transaction
    // We must use a subquery to get distinct transaction totals first, then sum them
    const customerDetailsQuery = `
      SELECT
        customer_code,
        MAX(customer_description) as customer_name,
        MAX(trx_routecode) as territory,
        MAX(route_areacode) as region,
        MAX(route_areacode) as region_name,
        MAX(route_subareacode) as city,
        MAX(customer_channelcode) as channel_code,
        MAX(customer_channel_description) as chain_name,
        'Active' as status,
        COALESCE(SUM(transaction_total), 0) as total_sales,
        COUNT(DISTINCT trx_trxcode) as total_orders,
        CASE
          WHEN COUNT(DISTINCT trx_trxcode) > 0
          THEN COALESCE(SUM(transaction_total), 0) / COUNT(DISTINCT trx_trxcode)
          ELSE 0
        END as avg_order_value,
        MAX(trx_currencycode) as currency_code,
        MAX(trx_trxdate::date) as last_order_date,
        COUNT(DISTINCT trx_usercode) as assigned_salesmen
      FROM (
        SELECT DISTINCT ON (customer_code, trx_trxcode)
          customer_code,
          customer_description,
          trx_routecode,
          route_areacode,
          route_subareacode,
          customer_channelcode,
          customer_channel_description,
          trx_currencycode,
          trx_trxcode,
          trx_trxdate,
          trx_usercode,
          trx_totalamount as transaction_total
        FROM flat_daily_sales_report
        ${whereClause}
      ) AS distinct_transactions
      GROUP BY customer_code
      ORDER BY ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    params.push(limit)
    params.push(offset)

    const customerResult = await query(customerDetailsQuery, params)

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT customer_code) as total_count
      FROM flat_daily_sales_report
      ${whereClause}
    `
    const countParams = params.slice(0, -2)
    const countResult = await query(countQuery, countParams)
    const totalCount = parseInt(countResult.rows[0]?.total_count || '0')

    // Format customer data
    const customers = (customerResult.rows || []).map(customer => {
      const daysSince = customer.last_order_date
        ? Math.floor((new Date().getTime() - new Date(customer.last_order_date).getTime()) / (1000 * 60 * 60 * 24))
        : null

      return {
        customerCode: customer.customer_code || '',
        customerName: customer.customer_name || '',
        territory: customer.territory || '',
        region: customer.region || '',
        regionName: customer.region_name || customer.region || '',
        city: customer.city || '',
        channelCode: customer.channel_code || '',
        chainName: customer.chain_name || '',
        totalSales: parseFloat(customer.total_sales || '0'),
        totalOrders: parseInt(customer.total_orders || '0'),
        avgOrderValue: parseFloat(customer.avg_order_value || '0'),
        status: customer.status || 'Active',
        lastOrderDate: customer.last_order_date || null,
        assignedSalesmen: parseInt(customer.assigned_salesmen || '0'),
        currencyCode: customer.currency_code || 'AED',
        daysSinceLastOrder: daysSince
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          pageSize: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      },
      timestamp: new Date().toISOString(),
      source: 'flat_daily_sales_report'
    })

  } catch (error) {
    console.error('Customer details API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch customer details',
      message: error instanceof Error ? error.message : 'Unknown error',
      data: {
        customers: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          pageSize: 25,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    }, { status: 500 })
  }
}

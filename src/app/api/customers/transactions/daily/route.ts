import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerCode = searchParams.get('customerCode')
    const dateRange = searchParams.get('range') || 'lastMonth'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const offset = (page - 1) * limit

    if (!customerCode) {
      return NextResponse.json({
        success: false,
        error: 'Customer code is required'
      }, { status: 400 })
    }

    // Calculate date range filter
    const today = new Date()
    let startDate: Date
    let endDate = today

    switch(dateRange) {
      case 'today':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        endDate = today
        break
      case 'yesterday':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
        break
      case 'thisWeek':
        const dayOfWeek = today.getDay()
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek)
        endDate = today
        break
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        endDate = today
        break
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        endDate = new Date(today.getFullYear(), today.getMonth(), 0)
        break
      case 'lastQuarter':
        const currentQuarter = Math.floor(today.getMonth() / 3)
        const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1
        const lastQuarterYear = currentQuarter === 0 ? today.getFullYear() - 1 : today.getFullYear()
        startDate = new Date(lastQuarterYear, lastQuarter * 3, 1)
        endDate = new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0)
        break
      case 'thisYear':
        startDate = new Date(today.getFullYear(), 0, 1)
        endDate = today
        break
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1)
    }

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Get daily transaction summary using flat_daily_sales_report table
    // This query aggregates all transactions by date and type
    const dailyTransactionsQuery = `
      WITH daily_summary AS (
        SELECT
          trx_trxdate::date as transaction_date,
          -- Sales (trx_trxtype = '1')
          SUM(CASE WHEN trx_trxtype = '1' THEN trx_totalamount ELSE 0 END) as sales_amount,
          COUNT(DISTINCT CASE WHEN trx_trxtype = '1' THEN trx_trxcode END) as sales_count,
          SUM(CASE WHEN trx_trxtype = '1' THEN line_quantitybu ELSE 0 END) as sales_quantity,

          -- Good Returns (trx_trxtype = '4' AND trx_collectiontype = '1')
          SUM(CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '1' THEN ABS(trx_totalamount) ELSE 0 END) as good_returns_amount,
          COUNT(DISTINCT CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '1' THEN trx_trxcode END) as good_returns_count,
          SUM(CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '1' THEN ABS(line_quantitybu) ELSE 0 END) as good_returns_quantity,

          -- Bad Returns (trx_trxtype = '4' AND trx_collectiontype = '0')
          SUM(CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '0' THEN ABS(trx_totalamount) ELSE 0 END) as bad_returns_amount,
          COUNT(DISTINCT CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '0' THEN trx_trxcode END) as bad_returns_count,
          SUM(CASE WHEN trx_trxtype = '4' AND trx_collectiontype = '0' THEN ABS(line_quantitybu) ELSE 0 END) as bad_returns_quantity,

          -- Deliveries/Stock In (trx_trxtype = '3')
          SUM(CASE WHEN trx_trxtype = '3' THEN trx_totalamount ELSE 0 END) as delivery_amount,
          COUNT(DISTINCT CASE WHEN trx_trxtype = '3' THEN trx_trxcode END) as delivery_count,
          SUM(CASE WHEN trx_trxtype = '3' THEN line_quantitybu ELSE 0 END) as delivery_quantity,

          -- Get currency
          MAX(trx_currencycode) as currency_code
        FROM flat_daily_sales_report
        WHERE customer_code = $1
          AND trx_trxdate::date BETWEEN $2::date AND $3::date
        GROUP BY trx_trxdate::date
        ORDER BY trx_trxdate::date DESC
      )
      SELECT
        transaction_date,
        sales_amount,
        sales_count,
        sales_quantity,
        good_returns_amount,
        good_returns_count,
        good_returns_quantity,
        bad_returns_amount,
        bad_returns_count,
        bad_returns_quantity,
        delivery_amount,
        delivery_count,
        delivery_quantity,
        currency_code,
        -- Calculate net amount (sales - returns + deliveries)
        (sales_amount - COALESCE(good_returns_amount, 0) - COALESCE(bad_returns_amount, 0) + COALESCE(delivery_amount, 0)) as net_amount
      FROM daily_summary
      LIMIT $4 OFFSET $5
    `

    // Get count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT trx_trxdate::date) as total_days
      FROM flat_daily_sales_report
      WHERE customer_code = $1
        AND trx_trxdate::date BETWEEN $2::date AND $3::date
    `

    const [transactionsResult, countResult] = await Promise.all([
      query(dailyTransactionsQuery, [customerCode, startDateStr, endDateStr, limit, offset]),
      query(countQuery, [customerCode, startDateStr, endDateStr])
    ])

    const totalDays = parseInt(countResult.rows[0]?.total_days || 0)

    // Get customer info from flat_daily_sales_report
    const customerQuery = `
      SELECT
        customer_code,
        MAX(customer_description) as customer_name,
        MAX(trx_routecode) as route_code,
        MAX(route_subareacode) as city,
        'Active' as is_active
      FROM flat_daily_sales_report
      WHERE customer_code = $1
      GROUP BY customer_code
      LIMIT 1
    `

    const customerResult = await query(customerQuery, [customerCode])
    const currency = transactionsResult.rows[0]?.currency_code || 'AED'

    // Calculate totals
    const totals = {
      salesAmount: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.sales_amount || 0), 0),
      salesCount: transactionsResult.rows.reduce((sum, row) => sum + parseInt(row.sales_count || 0), 0),
      salesQuantity: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.sales_quantity || 0), 0),
      goodReturnsAmount: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.good_returns_amount || 0), 0),
      goodReturnsCount: transactionsResult.rows.reduce((sum, row) => sum + parseInt(row.good_returns_count || 0), 0),
      goodReturnsQuantity: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.good_returns_quantity || 0), 0),
      badReturnsAmount: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.bad_returns_amount || 0), 0),
      badReturnsCount: transactionsResult.rows.reduce((sum, row) => sum + parseInt(row.bad_returns_count || 0), 0),
      badReturnsQuantity: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.bad_returns_quantity || 0), 0),
      deliveryAmount: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.delivery_amount || 0), 0),
      deliveryCount: transactionsResult.rows.reduce((sum, row) => sum + parseInt(row.delivery_count || 0), 0),
      deliveryQuantity: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.delivery_quantity || 0), 0),
      netAmount: transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.net_amount || 0), 0)
    }

    return NextResponse.json({
      success: true,
      data: {
        customer: customerResult.rows[0] || null,
        currencyCode: currency,
        transactions: transactionsResult.rows.map(row => ({
          date: row.transaction_date,
          sales: {
            amount: parseFloat(row.sales_amount || 0),
            count: parseInt(row.sales_count || 0),
            quantity: parseFloat(row.sales_quantity || 0)
          },
          goodReturns: {
            amount: parseFloat(row.good_returns_amount || 0),
            count: parseInt(row.good_returns_count || 0),
            quantity: parseFloat(row.good_returns_quantity || 0)
          },
          badReturns: {
            amount: parseFloat(row.bad_returns_amount || 0),
            count: parseInt(row.bad_returns_count || 0),
            quantity: parseFloat(row.bad_returns_quantity || 0)
          },
          deliveries: {
            amount: parseFloat(row.delivery_amount || 0),
            count: parseInt(row.delivery_count || 0),
            quantity: parseFloat(row.delivery_quantity || 0)
          },
          netAmount: parseFloat(row.net_amount || 0),
          currencyCode: currency
        })),
        totals
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDays / limit),
        totalCount: totalDays,
        pageSize: limit,
        hasNextPage: page < Math.ceil(totalDays / limit),
        hasPrevPage: page > 1
      }
    })

  } catch (error) {
    console.error('Customer daily transactions API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch customer daily transactions',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

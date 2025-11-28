import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerCode = searchParams.get('customerCode')
    const dateRange = searchParams.get('range') || 'lastMonth'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
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

    // Get detailed transaction line items
    // Note: trx_totalamount is the TRANSACTION total, repeated on each line
    // We'll show it for reference but it's the same for all lines in a transaction
    const transactionsQuery = `
      SELECT
        trx_trxcode as transaction_id,
        trx_trxdate::date as date,
        trx_totalamount as transaction_total,
        line_itemcode as product_code,
        COALESCE(line_itemdescription, item_description, line_itemcode) as product_name,
        line_quantitybu as quantity,
        line_baseprice as unit_price,
        (line_baseprice * line_quantitybu) as line_total,
        line_totaldiscountamount as line_discount,
        ((line_baseprice * line_quantitybu) - COALESCE(line_totaldiscountamount, 0)) as line_net_amount,
        trx_currencycode as currency_code
      FROM flat_daily_sales_report
      WHERE customer_code = $1
        AND trx_trxtype = '1'
        AND trx_trxdate::date BETWEEN $2::date AND $3::date
      ORDER BY trx_trxdate DESC, trx_trxcode DESC, line_itemcode
      LIMIT $4 OFFSET $5
    `

    // Get count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM flat_daily_sales_report
      WHERE customer_code = $1
        AND trx_trxtype = '1'
        AND trx_trxdate::date BETWEEN $2::date AND $3::date
    `

    const [transactionsResult, countResult] = await Promise.all([
      query(transactionsQuery, [customerCode, startDateStr, endDateStr, limit, offset]),
      query(countQuery, [customerCode, startDateStr, endDateStr])
    ])

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0)
    const currency = transactionsResult.rows[0]?.currency_code || 'AED'

    // Get customer info
    const customerQuery = `
      SELECT
        customer_code,
        MAX(customer_description) as customer_name
      FROM flat_daily_sales_report
      WHERE customer_code = $1
      GROUP BY customer_code
      LIMIT 1
    `

    const customerResult = await query(customerQuery, [customerCode])

    return NextResponse.json({
      success: true,
      data: {
        customer: customerResult.rows[0] || null,
        currencyCode: currency,
        transactions: transactionsResult.rows.map(row => ({
          transactionId: row.transaction_id,
          date: row.date,
          transactionTotal: parseFloat(row.transaction_total || 0),
          productCode: row.product_code,
          productName: row.product_name,
          quantity: parseFloat(row.quantity || 0),
          unitPrice: parseFloat(row.unit_price || 0),
          lineTotal: parseFloat(row.line_total || 0),
          lineDiscount: parseFloat(row.line_discount || 0),
          lineNetAmount: parseFloat(row.line_net_amount || 0),
          currencyCode: currency
        }))
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        pageSize: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    })

  } catch (error) {
    console.error('Customer transaction details API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch transaction details',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

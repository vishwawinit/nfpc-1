import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Use the flat_daily_sales_report table
const SALES_TABLE = 'flat_daily_sales_report'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Get parameters
    const currentDate = searchParams.get('currentDate') || new Date().toISOString().split('T')[0]
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const userCode = searchParams.get('userCode')
    const storeCode = searchParams.get('storeCode')
    const chainName = searchParams.get('chainName')
    const productCategory = searchParams.get('productCategory')
    const productCode = searchParams.get('productCode')

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 10000)
    const offset = (page - 1) * limit

    // Calculate date ranges for MTD and LMTD
    // MTD: Use provided startDate (defaults to 1st of current month) to endDate
    // LMTD: Always from 1st of last month to the same day of last month

    const selectedEndDate = endDate || currentDate
    const [year, month, day] = selectedEndDate.split('-').map(Number)

    // MTD: Use provided startDate if available, otherwise default to 1st of current month
    const mtdStart = startDate || `${year}-${String(month).padStart(2, '0')}-01`
    const mtdEnd = selectedEndDate

    // LMTD: From 1st of last month to same day in last month
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    // Handle day overflow for previous month (e.g., March 31 -> Feb 28/29)
    const lastDayOfPrevMonth = new Date(year, month - 1, 0).getDate()
    const adjustedDay = Math.min(day, lastDayOfPrevMonth)

    const lmtdStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const lmtdEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`

    console.log('LMTD Secondary Sales API - Date Ranges:', {
      receivedParams: { startDate, endDate, currentDate },
      mtdPeriod: { start: mtdStart, end: mtdEnd },
      lmtdPeriod: { start: lmtdStart, end: lmtdEnd }
    })

    console.log('LMTD Secondary - Using table:', SALES_TABLE)

    // Build filter conditions for flat_daily_sales_report
    let filterConditions: string[] = []
    let filterParams: any[] = []
    let paramIndex = 5 // Starting after the 4 date parameters

    // Always filter for sales transactions
    filterConditions.push(`trx_trxtype = 1`)

    if (teamLeaderCode) {
      filterConditions.push(`route_salesmancode = $${paramIndex}`)
      filterParams.push(teamLeaderCode)
      paramIndex++
    }

    if (userCode) {
      filterConditions.push(`trx_usercode = $${paramIndex}`)
      filterParams.push(userCode)
      paramIndex++
    }

    if (storeCode) {
      filterConditions.push(`customer_code = $${paramIndex}`)
      filterParams.push(storeCode)
      paramIndex++
    }

    if (chainName) {
      filterConditions.push(`customer_channel_description = $${paramIndex}`)
      filterParams.push(chainName)
      paramIndex++
    }

    if (productCategory) {
      filterConditions.push(`item_grouplevel1 = $${paramIndex}`)
      filterParams.push(productCategory)
      paramIndex++
    }

    if (productCode) {
      filterConditions.push(`line_itemcode = $${paramIndex}`)
      filterParams.push(productCode)
      paramIndex++
    }

    const whereClause = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : ''

    // Optimized main query - aggregate by user/store/product only (not by date)
    const mainQueryText = `
      WITH combined_sales AS (
        SELECT
          trx_usercode as field_user_code,
          customer_code as store_code,
          line_itemcode as product_code,
          MAX(route_salesmancode) as tl_code,
          MAX(customer_description) as store_name,
          MAX(customer_channel_description) as chain_name,
          MAX(line_itemdescription) as product_name,
          SUM(CASE
            WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date
            THEN ABS(COALESCE(line_quantitybu, 0))
            ELSE 0
          END) as mtd_quantity,
          SUM(CASE
            WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
            THEN trx_totalamount
            ELSE 0
          END) as mtd_amount,
          SUM(CASE
            WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date
            THEN ABS(COALESCE(line_quantitybu, 0))
            ELSE 0
          END) as lmtd_quantity,
          SUM(CASE
            WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
            THEN trx_totalamount
            ELSE 0
          END) as lmtd_amount,
          MAX(CASE
            WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date
            THEN trx_trxdate::date
          END) as mtd_last_date,
          MAX(CASE
            WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date
            THEN trx_trxdate::date
          END) as lmtd_last_date
        FROM ${SALES_TABLE}
        WHERE ((trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date)
           OR (trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date))
          AND trx_trxtype = 1
          ${whereClause}
        GROUP BY trx_usercode, customer_code, line_itemcode
        HAVING SUM(CASE
            WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
            THEN trx_totalamount ELSE 0 END) > 0
           OR SUM(CASE
            WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
            THEN trx_totalamount ELSE 0 END) > 0
      )
      SELECT
        COALESCE(mtd_last_date, lmtd_last_date) as "date",
        COALESCE(tl_code, '') as "tlCode",
        COALESCE(tl_code, '') as "tlName",
        COALESCE(field_user_code, '') as "fieldUserCode",
        COALESCE(field_user_code, '') as "fieldUserName",
        COALESCE(store_code, '') as "storeCode",
        COALESCE(store_name, '') as "storeName",
        COALESCE(chain_name, '') as "chainName",
        COALESCE(product_code, '') as "productCode",
        COALESCE(product_name, '') as "productName",
        mtd_quantity as "secondarySalesCurrentMonth",
        mtd_amount as "secondarySalesRevenueCurrentMonth",
        lmtd_quantity as "secondarySalesLastMonth",
        lmtd_amount as "secondarySalesRevenueLastMonth",
        (mtd_quantity - lmtd_quantity) as "secondarySalesDiff",
        (mtd_amount - lmtd_amount) as "secondarySalesRevenueDiff",
        CASE
          WHEN lmtd_amount = 0 THEN CASE WHEN mtd_amount > 0 THEN 100 ELSE 0 END
          ELSE ROUND(((mtd_amount - lmtd_amount) / lmtd_amount * 100)::numeric, 2)
        END as "revenueVariancePercent",
        CASE
          WHEN lmtd_quantity = 0 THEN CASE WHEN mtd_quantity > 0 THEN 100 ELSE 0 END
          ELSE ROUND(((mtd_quantity - lmtd_quantity) / lmtd_quantity * 100)::numeric, 2)
        END as "quantityVariancePercent"
      FROM combined_sales
      ORDER BY mtd_amount DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    // Optimized summary query - single table scan
    const summaryQueryText = `
      SELECT
        SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date
          THEN ABS(COALESCE(line_quantitybu, 0))
          ELSE 0
        END) as total_mtd_quantity,
        SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as total_mtd_revenue,
        SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date
          THEN ABS(COALESCE(line_quantitybu, 0))
          ELSE 0
        END) as total_lmtd_quantity,
        SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as total_lmtd_revenue,
        COUNT(DISTINCT customer_code) as unique_stores,
        COUNT(DISTINCT line_itemcode) as unique_products,
        COUNT(DISTINCT trx_usercode) as unique_users,
        COUNT(DISTINCT route_salesmancode) as unique_team_leaders
      FROM ${SALES_TABLE}
      WHERE ((trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date)
         OR (trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date))
        AND trx_trxtype = 1
        ${whereClause}
    `

    // Optimized daily trend query - single table scan with conditional aggregation
    const dailyTrendQueryText = `
      SELECT
        EXTRACT(DAY FROM trx_trxdate::date)::int as day,
        SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as mtd_revenue,
        SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as lmtd_revenue
      FROM ${SALES_TABLE}
      WHERE ((trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date)
         OR (trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date))
        AND trx_trxtype = 1
        ${whereClause}
      GROUP BY EXTRACT(DAY FROM trx_trxdate::date)
      HAVING SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
          THEN trx_totalamount ELSE 0 END) > 0
         OR SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
          THEN trx_totalamount ELSE 0 END) > 0
      ORDER BY day
    `

    // Optimized top products query - single table scan
    const topProductsQueryText = `
      SELECT
        line_itemcode as product_code,
        MAX(line_itemdescription) as product_name,
        SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as mtd_revenue,
        SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
          THEN trx_totalamount
          ELSE 0
        END) as lmtd_revenue
      FROM ${SALES_TABLE}
      WHERE ((trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date)
         OR (trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date))
        AND trx_trxtype = 1
        AND line_itemcode IS NOT NULL
        ${whereClause}
      GROUP BY line_itemcode
      HAVING SUM(CASE
          WHEN trx_trxdate::date >= $1::date AND trx_trxdate::date <= $2::date AND trx_totalamount > 0
          THEN trx_totalamount ELSE 0 END) > 0
         OR SUM(CASE
          WHEN trx_trxdate::date >= $3::date AND trx_trxdate::date <= $4::date AND trx_totalamount > 0
          THEN trx_totalamount ELSE 0 END) > 0
      ORDER BY mtd_revenue DESC
      LIMIT 10
    `

    // Execute queries
    const allParams = [mtdStart, mtdEnd, lmtdStart, lmtdEnd, ...filterParams]

    const [dataResult, summaryResult, dailyTrendResult, topProductsResult] = await Promise.all([
      query(mainQueryText, [...allParams, limit, offset]),
      query(summaryQueryText, allParams),
      query(dailyTrendQueryText, allParams),
      query(topProductsQueryText, allParams)
    ])

    // Parse results
    const detailedData = dataResult.rows.map(row => ({
      date: row.date,
      tlCode: row.tlCode || '',
      tlName: row.tlName || '',
      fieldUserCode: row.fieldUserCode || '',
      fieldUserName: row.fieldUserName || '',
      storeCode: row.storeCode || '',
      storeName: row.storeName || '',
      chainName: row.chainName || '',
      productCode: row.productCode || '',
      productName: row.productName || '',
      secondarySalesCurrentMonth: parseFloat(row.secondarySalesCurrentMonth || '0'),
      secondarySalesRevenueCurrentMonth: parseFloat(row.secondarySalesRevenueCurrentMonth || '0'),
      secondarySalesLastMonth: parseFloat(row.secondarySalesLastMonth || '0'),
      secondarySalesRevenueLastMonth: parseFloat(row.secondarySalesRevenueLastMonth || '0'),
      secondarySalesDiff: parseFloat(row.secondarySalesDiff || '0'),
      secondarySalesRevenueDiff: parseFloat(row.secondarySalesRevenueDiff || '0'),
      revenueVariancePercent: parseFloat(row.revenueVariancePercent || '0'),
      quantityVariancePercent: parseFloat(row.quantityVariancePercent || '0')
    }))

    // Parse summary
    const summaryRow = summaryResult.rows[0] || {}
    const totalMtdQuantity = parseFloat(summaryRow.total_mtd_quantity || '0')
    const totalMtdRevenue = parseFloat(summaryRow.total_mtd_revenue || '0')
    const totalLmtdQuantity = parseFloat(summaryRow.total_lmtd_quantity || '0')
    const totalLmtdRevenue = parseFloat(summaryRow.total_lmtd_revenue || '0')

    const summary = {
      totalMtdQuantity,
      totalMtdRevenue,
      totalLmtdQuantity,
      totalLmtdRevenue,
      totalQuantityDiff: totalMtdQuantity - totalLmtdQuantity,
      totalRevenueDiff: totalMtdRevenue - totalLmtdRevenue,
      uniqueStores: parseInt(summaryRow.unique_stores || '0'),
      uniqueProducts: parseInt(summaryRow.unique_products || '0'),
      uniqueUsers: parseInt(summaryRow.unique_users || '0'),
      uniqueTeamLeaders: parseInt(summaryRow.unique_team_leaders || '0'),
      transactionCount: detailedData.length,
      revenueVariancePercent: totalLmtdRevenue > 0
        ? parseFloat(((totalMtdRevenue - totalLmtdRevenue) / totalLmtdRevenue * 100).toFixed(2))
        : totalMtdRevenue > 0 ? 100 : 0,
      quantityVariancePercent: totalLmtdQuantity > 0
        ? parseFloat(((totalMtdQuantity - totalLmtdQuantity) / totalLmtdQuantity * 100).toFixed(2))
        : totalMtdQuantity > 0 ? 100 : 0
    }

    // Parse daily trend data
    const dailyTrend = dailyTrendResult.rows.map(row => ({
      day: parseInt(row.day || '0'),
      mtdRevenue: parseFloat(row.mtd_revenue || '0'),
      lmtdRevenue: parseFloat(row.lmtd_revenue || '0')
    })).filter(d => d.day > 0)

    // Parse top products data
    const topProducts = topProductsResult.rows.map(row => ({
      productCode: row.product_code || '',
      productName: row.product_name || row.product_code || 'Unknown',
      mtdRevenue: parseFloat(row.mtd_revenue || '0'),
      lmtdRevenue: parseFloat(row.lmtd_revenue || '0')
    }))

    console.log('LMTD Secondary - Results:', {
      dataCount: detailedData.length,
      mtdRevenue: totalMtdRevenue,
      lmtdRevenue: totalLmtdRevenue,
      dailyTrendCount: dailyTrend.length,
      topProductsCount: topProducts.length
    })

    return NextResponse.json({
      success: true,
      data: detailedData,
      summary,
      dailyTrend,
      topProducts,
      pagination: {
        page,
        limit,
        total: detailedData.length,
        totalPages: Math.ceil(detailedData.length / limit),
        hasNextPage: detailedData.length === limit,
        hasPrevPage: page > 1
      },
      periods: {
        mtd: { start: mtdStart, end: mtdEnd },
        lmtd: { start: lmtdStart, end: lmtdEnd }
      },
      timestamp: new Date().toISOString(),
      source: SALES_TABLE
    })

  } catch (error) {
    console.error('LMTD Secondary Sales API error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch LMTD secondary sales data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

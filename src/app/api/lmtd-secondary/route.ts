import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering for routes that use searchParams (Updated: 2025-11-29 03:07)
export const dynamic = 'force-dynamic'
export const revalidate = false // Disable automatic revalidation, use manual caching

// Use the flat_daily_sales_report table
const SALES_TABLE = 'flat_daily_sales_report'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/lmtd-secondary', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    console.log('🔄 Fetching fresh LMTD secondary data from database...')

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

    // Pagination parameters - No limit, fetch all data
    const page = parseInt(searchParams.get('page') || '1')
    const requestedLimit = searchParams.get('limit')
    const limit = requestedLimit ? parseInt(requestedLimit) : 999999999 // No limit by default
    const offset = (page - 1) * limit

    console.log('LMTD Secondary - Pagination:', { page, limit, offset })

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

    console.log('LMTD Secondary Sales API - Request Details:', {
      receivedParams: { startDate, endDate, currentDate },
      filters: {
        teamLeaderCode: teamLeaderCode || null,
        userCode: userCode || null,
        storeCode: storeCode || null,
        chainName: chainName || null,
        productCode: productCode || null
      },
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

    console.log('LMTD Secondary - Filter SQL:', {
      whereClause: whereClause || 'No additional filters',
      filterParams,
      filterConditionsCount: filterConditions.length
    })

    // HYPER-OPTIMIZED main query with materialized CTEs for better performance
    const mainQueryText = `
      WITH mtd_data AS MATERIALIZED (
        SELECT
          trx_usercode,
          customer_code,
          line_itemcode,
          COALESCE(MAX(route_salesmancode), '') as tl_code,
          MAX(customer_description) as store_name,
          MAX(customer_channel_description) as chain_name,
          MAX(line_itemdescription) as product_name,
          SUM(ABS(COALESCE(line_quantitybu, 0))) as mtd_quantity,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as mtd_revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $1::date
          AND trx_trxdate <= $2::date
          AND trx_trxtype = 1
          ${whereClause}
        GROUP BY trx_usercode, customer_code, line_itemcode
      ),
      lmtd_data AS MATERIALIZED (
        SELECT
          trx_usercode,
          customer_code,
          line_itemcode,
          SUM(ABS(COALESCE(line_quantitybu, 0))) as lmtd_quantity,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as lmtd_revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $3::date
          AND trx_trxdate <= $4::date
          AND trx_trxtype = 1
          ${whereClause}
        GROUP BY trx_usercode, customer_code, line_itemcode
      )
      SELECT
        $2::date as "date",
        COALESCE(m.tl_code, '') as "tlCode",
        COALESCE(m.tl_code, '') as "tlName",
        COALESCE(m.trx_usercode, l.trx_usercode) as "fieldUserCode",
        COALESCE(m.trx_usercode, l.trx_usercode) as "fieldUserName",
        COALESCE(m.customer_code, l.customer_code) as "storeCode",
        COALESCE(m.store_name, '') as "storeName",
        COALESCE(m.chain_name, '') as "chainName",
        COALESCE(m.line_itemcode, l.line_itemcode) as "productCode",
        COALESCE(m.product_name, '') as "productName",
        COALESCE(m.mtd_quantity, 0) as "secondarySalesCurrentMonth",
        COALESCE(m.mtd_revenue, 0) as "secondarySalesRevenueCurrentMonth",
        COALESCE(l.lmtd_quantity, 0) as "secondarySalesLastMonth",
        COALESCE(l.lmtd_revenue, 0) as "secondarySalesRevenueLastMonth",
        COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0) as "secondarySalesDiff",
        COALESCE(m.mtd_revenue, 0) - COALESCE(l.lmtd_revenue, 0) as "secondarySalesRevenueDiff",
        CASE
          WHEN COALESCE(l.lmtd_revenue, 0) > 0
          THEN ((COALESCE(m.mtd_revenue, 0) - COALESCE(l.lmtd_revenue, 0)) / l.lmtd_revenue * 100)
          WHEN COALESCE(m.mtd_revenue, 0) > 0 THEN 100
          ELSE 0
        END as "revenueVariancePercent",
        CASE
          WHEN COALESCE(l.lmtd_quantity, 0) > 0
          THEN ((COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0)) / l.lmtd_quantity * 100)
          WHEN COALESCE(m.mtd_quantity, 0) > 0 THEN 100
          ELSE 0
        END as "quantityVariancePercent"
      FROM mtd_data m
      FULL OUTER JOIN lmtd_data l
        ON m.trx_usercode = l.trx_usercode
        AND m.customer_code = l.customer_code
        AND m.line_itemcode = l.line_itemcode
      WHERE COALESCE(m.mtd_revenue, 0) > 0 OR COALESCE(l.lmtd_revenue, 0) > 0
      ORDER BY COALESCE(m.mtd_revenue, 0) DESC
      LIMIT ${limit}
    `

    // HYPER-OPTIMIZED summary query with materialized CTEs
    const summaryQueryText = `
      WITH mtd_summary AS MATERIALIZED (
        SELECT
          SUM(ABS(COALESCE(line_quantitybu, 0))) as quantity,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue,
          COUNT(DISTINCT customer_code) as stores,
          COUNT(DISTINCT line_itemcode) as products,
          COUNT(DISTINCT trx_usercode) as users,
          COUNT(DISTINCT route_salesmancode) as team_leaders
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $1::date
          AND trx_trxdate <= $2::date
          AND trx_trxtype = 1
          ${whereClause}
      ),
      lmtd_summary AS MATERIALIZED (
        SELECT
          SUM(ABS(COALESCE(line_quantitybu, 0))) as quantity,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue,
          COUNT(DISTINCT customer_code) as stores,
          COUNT(DISTINCT line_itemcode) as products,
          COUNT(DISTINCT trx_usercode) as users,
          COUNT(DISTINCT route_salesmancode) as team_leaders
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $3::date
          AND trx_trxdate <= $4::date
          AND trx_trxtype = 1
          ${whereClause}
      )
      SELECT
        COALESCE(m.quantity, 0) as total_mtd_quantity,
        COALESCE(m.revenue, 0) as total_mtd_revenue,
        COALESCE(l.quantity, 0) as total_lmtd_quantity,
        COALESCE(l.revenue, 0) as total_lmtd_revenue,
        GREATEST(COALESCE(m.stores, 0), COALESCE(l.stores, 0)) as unique_stores,
        GREATEST(COALESCE(m.products, 0), COALESCE(l.products, 0)) as unique_products,
        GREATEST(COALESCE(m.users, 0), COALESCE(l.users, 0)) as unique_users,
        GREATEST(COALESCE(m.team_leaders, 0), COALESCE(l.team_leaders, 0)) as unique_team_leaders
      FROM mtd_summary m, lmtd_summary l
    `

    // HYPER-OPTIMIZED daily trend query with materialized CTEs
    const dailyTrendQueryText = `
      WITH mtd_trend AS MATERIALIZED (
        SELECT
          EXTRACT(DAY FROM trx_trxdate)::int as day,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $1::date
          AND trx_trxdate <= $2::date
          AND trx_trxtype = 1
          ${whereClause}
        GROUP BY EXTRACT(DAY FROM trx_trxdate)
      ),
      lmtd_trend AS MATERIALIZED (
        SELECT
          EXTRACT(DAY FROM trx_trxdate)::int as day,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $3::date
          AND trx_trxdate <= $4::date
          AND trx_trxtype = 1
          ${whereClause}
        GROUP BY EXTRACT(DAY FROM trx_trxdate)
      )
      SELECT
        COALESCE(m.day, l.day) as day,
        COALESCE(m.revenue, 0) as mtd_revenue,
        COALESCE(l.revenue, 0) as lmtd_revenue
      FROM mtd_trend m
      FULL OUTER JOIN lmtd_trend l ON m.day = l.day
      WHERE COALESCE(m.day, l.day) IS NOT NULL
      ORDER BY day
    `

    // HYPER-OPTIMIZED top products query with materialized CTEs
    const topProductsQueryText = `
      WITH mtd_products AS MATERIALIZED (
        SELECT
          line_itemcode as product_code,
          MAX(line_itemdescription) as product_name,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as mtd_revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $1::date
          AND trx_trxdate <= $2::date
          AND trx_trxtype = 1
          AND line_itemcode IS NOT NULL
          ${whereClause}
        GROUP BY line_itemcode
        ORDER BY mtd_revenue DESC
        LIMIT 10
      ),
      lmtd_products AS MATERIALIZED (
        SELECT
          line_itemcode as product_code,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as lmtd_revenue
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= $3::date
          AND trx_trxdate <= $4::date
          AND trx_trxtype = 1
          AND line_itemcode IN (SELECT product_code FROM mtd_products)
          ${whereClause}
        GROUP BY line_itemcode
      )
      SELECT
        m.product_code,
        m.product_name,
        m.mtd_revenue,
        COALESCE(l.lmtd_revenue, 0) as lmtd_revenue
      FROM mtd_products m
      LEFT JOIN lmtd_products l ON m.product_code = l.product_code
      ORDER BY m.mtd_revenue DESC
    `

    // Execute queries with timing - Both MTD and LMTD data
    const allParams = [mtdStart, mtdEnd, lmtdStart, lmtdEnd, ...filterParams]

    console.log('LMTD Secondary - Starting optimized MTD vs LMTD queries...', {
      timestamp: new Date().toISOString(),
      limit,
      filterCount: filterParams.length,
      mtdPeriod: { start: mtdStart, end: mtdEnd },
      lmtdPeriod: { start: lmtdStart, end: lmtdEnd }
    })
    const startTime = Date.now()

    const [dataResult, summaryResult, dailyTrendResult, topProductsResult] = await Promise.all([
      query(mainQueryText, allParams),
      query(summaryQueryText, allParams),
      query(dailyTrendQueryText, allParams),
      query(topProductsQueryText, allParams)
    ])

    const queryTime = Date.now() - startTime
    console.log('LMTD Secondary - Queries completed:', {
      totalTime: `${queryTime}ms`,
      totalTimeSeconds: `${(queryTime / 1000).toFixed(2)}s`,
      timestamp: new Date().toISOString()
    })

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

    const responseJson = {
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
      source: SALES_TABLE,
      cached: false
    }

    // Store in cache
    apiCache.set('/api/lmtd-secondary', searchParams, responseJson)

    return NextResponse.json(responseJson)

  } catch (error) {
    console.error('LMTD Secondary Sales API error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch LMTD secondary sales data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

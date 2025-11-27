import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await db.initialize()

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

    // Calculate date ranges based on user selections
    const selectedEndDate = endDate || currentDate
    const selectedStartDate = startDate || `${selectedEndDate.split('-')[0]}-${selectedEndDate.split('-')[1]}-01`

    const [endYear, endMonth, endDay] = selectedEndDate.split('-').map(Number)
    const [startYear, startMonth, startDay] = selectedStartDate.split('-').map(Number)

    // MTD: Use the selected date range
    const mtdStart = selectedStartDate
    const mtdEnd = selectedEndDate

    // LMTD: Same day range but in previous month
    // Calculate the previous month for start and end dates
    const prevMonthStart = startMonth === 1 ? 12 : startMonth - 1
    const prevYearStart = startMonth === 1 ? startYear - 1 : startYear
    const prevMonthEnd = endMonth === 1 ? 12 : endMonth - 1
    const prevYearEnd = endMonth === 1 ? endYear - 1 : endYear

    // Handle day overflow for previous month (e.g., March 31 -> Feb 28/29)
    const lastDayOfPrevMonthStart = new Date(startYear, startMonth - 1, 0).getDate()
    const lastDayOfPrevMonthEnd = new Date(endYear, endMonth - 1, 0).getDate()
    const adjustedStartDay = Math.min(startDay, lastDayOfPrevMonthStart)
    const adjustedEndDay = Math.min(endDay, lastDayOfPrevMonthEnd)

    const lmtdStart = `${prevYearStart}-${String(prevMonthStart).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`
    const lmtdEnd = `${prevYearEnd}-${String(prevMonthEnd).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`

    console.log('LMTD Secondary Sales API - Date Ranges:', {
      mtdPeriod: { start: mtdStart, end: mtdEnd },
      lmtdPeriod: { start: lmtdStart, end: lmtdEnd }
    })

    // Resolve transactions table
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const isTblTrxHeader = transactionsTable === '"tblTrxHeader"'

    console.log('LMTD Secondary - Using table:', transactionsTable)

    // Build filter conditions
    let filterConditions: string[] = []
    let filterParams: any[] = []
    let paramIndex = 5 // Starting after the 4 date parameters

    if (isTblTrxHeader) {
      // Build filters for tblTrxHeader
      if (teamLeaderCode) {
        filterConditions.push(`t."RouteCode" = $${paramIndex}`)
        filterParams.push(teamLeaderCode)
        paramIndex++
      }

      if (userCode) {
        filterConditions.push(`t."UserCode" = $${paramIndex}`)
        filterParams.push(userCode)
        paramIndex++
      }

      if (storeCode) {
        filterConditions.push(`t."ClientCode" = $${paramIndex}`)
        filterParams.push(storeCode)
        paramIndex++
      }

      if (chainName) {
        filterConditions.push(`c."JDECustomerType" = $${paramIndex}`)
        filterParams.push(chainName)
        paramIndex++
      }
    } else {
      // Build filters for flat_* tables
      if (teamLeaderCode) {
        filterConditions.push(`c.sales_person_code = $${paramIndex}`)
        filterParams.push(teamLeaderCode)
        paramIndex++
      }

      if (userCode) {
        filterConditions.push(`t.user_code = $${paramIndex}`)
        filterParams.push(userCode)
        paramIndex++
      }

      if (storeCode) {
        filterConditions.push(`t.customer_code = $${paramIndex}`)
        filterParams.push(storeCode)
        paramIndex++
      }

      if (chainName) {
        filterConditions.push(`c.customer_type = $${paramIndex}`)
        filterParams.push(chainName)
        paramIndex++
      }
    }

    const whereClause = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : ''

    let mainQueryText: string
    let summaryQueryText: string

    if (isTblTrxHeader) {
      // Query for tblTrxHeader with joins to tblUser and tblRoute
      mainQueryText = `
        WITH mtd_sales AS (
          SELECT
            DATE(t."TrxDate") as sale_date,
            COALESCE(t."RouteCode", '') as tl_code,
            COALESCE(r."Description", t."RouteCode", '') as tl_name,
            COALESCE(t."UserCode", '') as field_user_code,
            COALESCE(u."Description", '') as field_user_name,
            t."ClientCode" as store_code,
            COALESCE(c."Description", '') as store_name,
            COALESCE(c."JDECustomerType", '') as chain_name,
            '' as product_code,
            '' as product_name,
            COUNT(DISTINCT t."TrxCode") as mtd_quantity,
            SUM(COALESCE(t."TotalAmount", 0)) as mtd_amount
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
          LEFT JOIN "tblRoute" r ON t."RouteCode" = r."Code"
          WHERE DATE(t."TrxDate") >= $1::date
            AND DATE(t."TrxDate") <= $2::date
            AND t."TrxType" = 1
            ${whereClause}
          GROUP BY
            DATE(t."TrxDate"), t."RouteCode", r."Description",
            t."UserCode", u."Description", t."ClientCode", c."Description", c."JDECustomerType"
        ),
        lmtd_sales AS (
          SELECT
            DATE(t."TrxDate") as sale_date,
            COALESCE(t."RouteCode", '') as tl_code,
            COALESCE(r."Description", t."RouteCode", '') as tl_name,
            COALESCE(t."UserCode", '') as field_user_code,
            COALESCE(u."Description", '') as field_user_name,
            t."ClientCode" as store_code,
            COALESCE(c."Description", '') as store_name,
            COALESCE(c."JDECustomerType", '') as chain_name,
            '' as product_code,
            '' as product_name,
            COUNT(DISTINCT t."TrxCode") as lmtd_quantity,
            SUM(COALESCE(t."TotalAmount", 0)) as lmtd_amount
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
          LEFT JOIN "tblRoute" r ON t."RouteCode" = r."Code"
          WHERE DATE(t."TrxDate") >= $3::date
            AND DATE(t."TrxDate") <= $4::date
            AND t."TrxType" = 1
            ${whereClause}
          GROUP BY
            DATE(t."TrxDate"), t."RouteCode", r."Description",
            t."UserCode", u."Description", t."ClientCode", c."Description", c."JDECustomerType"
        )
        SELECT
          COALESCE(m.sale_date, l.sale_date) as "date",
          COALESCE(m.tl_code, l.tl_code) as "tlCode",
          COALESCE(m.tl_name, l.tl_name) as "tlName",
          COALESCE(m.field_user_code, l.field_user_code) as "fieldUserCode",
          COALESCE(m.field_user_name, l.field_user_name) as "fieldUserName",
          COALESCE(m.store_code, l.store_code) as "storeCode",
          COALESCE(m.store_name, l.store_name) as "storeName",
          COALESCE(m.chain_name, l.chain_name) as "chainName",
          '' as "productCode",
          '' as "productName",
          COALESCE(m.mtd_quantity, 0) as "secondarySalesCurrentMonth",
          COALESCE(m.mtd_amount, 0) as "secondarySalesRevenueCurrentMonth",
          COALESCE(l.lmtd_quantity, 0) as "secondarySalesLastMonth",
          COALESCE(l.lmtd_amount, 0) as "secondarySalesRevenueLastMonth",
          COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0) as "secondarySalesDiff",
          COALESCE(m.mtd_amount, 0) - COALESCE(l.lmtd_amount, 0) as "secondarySalesRevenueDiff",
          CASE
            WHEN COALESCE(l.lmtd_amount, 0) = 0 THEN
              CASE WHEN COALESCE(m.mtd_amount, 0) > 0 THEN 100 ELSE 0 END
            ELSE ROUND(((COALESCE(m.mtd_amount, 0) - COALESCE(l.lmtd_amount, 0)) / l.lmtd_amount * 100)::numeric, 2)
          END as "revenueVariancePercent",
          CASE
            WHEN COALESCE(l.lmtd_quantity, 0) = 0 THEN
              CASE WHEN COALESCE(m.mtd_quantity, 0) > 0 THEN 100 ELSE 0 END
            ELSE ROUND(((COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0)) / l.lmtd_quantity * 100)::numeric, 2)
          END as "quantityVariancePercent"
        FROM mtd_sales m
        FULL OUTER JOIN lmtd_sales l ON
          m.field_user_code = l.field_user_code
          AND m.store_code = l.store_code
        WHERE COALESCE(m.mtd_amount, 0) > 0 OR COALESCE(l.lmtd_amount, 0) > 0
        ORDER BY COALESCE(m.sale_date, l.sale_date) DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `

      summaryQueryText = `
        WITH mtd_sales AS (
          SELECT
            COUNT(DISTINCT t."TrxCode") as mtd_quantity,
            SUM(COALESCE(t."TotalAmount", 0)) as mtd_amount
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          WHERE DATE(t."TrxDate") >= $1::date
            AND DATE(t."TrxDate") <= $2::date
            AND t."TrxType" = 1
            ${whereClause}
        ),
        lmtd_sales AS (
          SELECT
            COUNT(DISTINCT t."TrxCode") as lmtd_quantity,
            SUM(COALESCE(t."TotalAmount", 0)) as lmtd_amount
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          WHERE DATE(t."TrxDate") >= $3::date
            AND DATE(t."TrxDate") <= $4::date
            AND t."TrxType" = 1
            ${whereClause}
        ),
        unique_counts AS (
          SELECT
            COUNT(DISTINCT t."ClientCode") as unique_stores,
            0 as unique_products,
            COUNT(DISTINCT t."UserCode") as unique_users,
            COUNT(DISTINCT t."RouteCode") as unique_team_leaders
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          WHERE ((DATE(t."TrxDate") >= $1::date AND DATE(t."TrxDate") <= $2::date)
             OR (DATE(t."TrxDate") >= $3::date AND DATE(t."TrxDate") <= $4::date))
            AND t."TrxType" = 1
            ${whereClause}
        )
        SELECT
          COALESCE(m.mtd_quantity, 0) as total_mtd_quantity,
          COALESCE(m.mtd_amount, 0) as total_mtd_revenue,
          COALESCE(l.lmtd_quantity, 0) as total_lmtd_quantity,
          COALESCE(l.lmtd_amount, 0) as total_lmtd_revenue,
          uc.unique_stores,
          uc.unique_products,
          uc.unique_users,
          uc.unique_team_leaders
        FROM mtd_sales m
        CROSS JOIN lmtd_sales l
        CROSS JOIN unique_counts uc
      `
    } else {
      // Query for flat_* tables (fallback)
      mainQueryText = `
        WITH mtd_sales AS (
          SELECT
            DATE(t.transaction_date) as sale_date,
            COALESCE(c.sales_person_code, '') as tl_code,
            '' as tl_name,
            t.user_code as field_user_code,
            '' as field_user_name,
            t.customer_code as store_code,
            COALESCE(c.customer_name, '') as store_name,
            COALESCE(c.customer_type, '') as chain_name,
            t.product_code,
            '' as product_name,
            SUM(COALESCE(t.quantity_bu, 0)) as mtd_quantity,
            SUM(COALESCE(t.net_amount, 0)) as mtd_amount
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $1::date
            AND DATE(t.transaction_date) <= $2::date
            ${whereClause}
          GROUP BY
            DATE(t.transaction_date), c.sales_person_code,
            t.user_code, t.customer_code, c.customer_name, c.customer_type,
            t.product_code
        ),
        lmtd_sales AS (
          SELECT
            DATE(t.transaction_date) as sale_date,
            COALESCE(c.sales_person_code, '') as tl_code,
            '' as tl_name,
            t.user_code as field_user_code,
            '' as field_user_name,
            t.customer_code as store_code,
            COALESCE(c.customer_name, '') as store_name,
            COALESCE(c.customer_type, '') as chain_name,
            t.product_code,
            '' as product_name,
            SUM(COALESCE(t.quantity_bu, 0)) as lmtd_quantity,
            SUM(COALESCE(t.net_amount, 0)) as lmtd_amount
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $3::date
            AND DATE(t.transaction_date) <= $4::date
            ${whereClause}
          GROUP BY
            DATE(t.transaction_date), c.sales_person_code,
            t.user_code, t.customer_code, c.customer_name, c.customer_type,
            t.product_code
        )
        SELECT
          COALESCE(m.sale_date, l.sale_date) as "date",
          COALESCE(m.tl_code, l.tl_code) as "tlCode",
          COALESCE(m.tl_name, l.tl_name) as "tlName",
          COALESCE(m.field_user_code, l.field_user_code) as "fieldUserCode",
          COALESCE(m.field_user_name, l.field_user_name) as "fieldUserName",
          COALESCE(m.store_code, l.store_code) as "storeCode",
          COALESCE(m.store_name, l.store_name) as "storeName",
          COALESCE(m.chain_name, l.chain_name) as "chainName",
          COALESCE(m.product_code, l.product_code) as "productCode",
          COALESCE(m.product_name, l.product_name) as "productName",
          COALESCE(m.mtd_quantity, 0) as "secondarySalesCurrentMonth",
          COALESCE(m.mtd_amount, 0) as "secondarySalesRevenueCurrentMonth",
          COALESCE(l.lmtd_quantity, 0) as "secondarySalesLastMonth",
          COALESCE(l.lmtd_amount, 0) as "secondarySalesRevenueLastMonth",
          COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0) as "secondarySalesDiff",
          COALESCE(m.mtd_amount, 0) - COALESCE(l.lmtd_amount, 0) as "secondarySalesRevenueDiff",
          CASE
            WHEN COALESCE(l.lmtd_amount, 0) = 0 THEN
              CASE WHEN COALESCE(m.mtd_amount, 0) > 0 THEN 100 ELSE 0 END
            ELSE ROUND(((COALESCE(m.mtd_amount, 0) - COALESCE(l.lmtd_amount, 0)) / l.lmtd_amount * 100)::numeric, 2)
          END as "revenueVariancePercent",
          CASE
            WHEN COALESCE(l.lmtd_quantity, 0) = 0 THEN
              CASE WHEN COALESCE(m.mtd_quantity, 0) > 0 THEN 100 ELSE 0 END
            ELSE ROUND(((COALESCE(m.mtd_quantity, 0) - COALESCE(l.lmtd_quantity, 0)) / l.lmtd_quantity * 100)::numeric, 2)
          END as "quantityVariancePercent"
        FROM mtd_sales m
        FULL OUTER JOIN lmtd_sales l ON
          m.field_user_code = l.field_user_code
          AND m.store_code = l.store_code
          AND m.product_code = l.product_code
        WHERE COALESCE(m.mtd_amount, 0) > 0 OR COALESCE(l.lmtd_amount, 0) > 0
        ORDER BY COALESCE(m.sale_date, l.sale_date) DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `

      summaryQueryText = `
        WITH mtd_sales AS (
          SELECT
            SUM(COALESCE(t.quantity_bu, 0)) as mtd_quantity,
            SUM(COALESCE(t.net_amount, 0)) as mtd_amount
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $1::date
            AND DATE(t.transaction_date) <= $2::date
            ${whereClause}
        ),
        lmtd_sales AS (
          SELECT
            SUM(COALESCE(t.quantity_bu, 0)) as lmtd_quantity,
            SUM(COALESCE(t.net_amount, 0)) as lmtd_amount
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $3::date
            AND DATE(t.transaction_date) <= $4::date
            ${whereClause}
        ),
        unique_counts AS (
          SELECT
            COUNT(DISTINCT t.customer_code) as unique_stores,
            COUNT(DISTINCT t.product_code) as unique_products,
            COUNT(DISTINCT t.user_code) as unique_users,
            COUNT(DISTINCT c.sales_person_code) as unique_team_leaders
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE (DATE(t.transaction_date) >= $1::date AND DATE(t.transaction_date) <= $2::date)
             OR (DATE(t.transaction_date) >= $3::date AND DATE(t.transaction_date) <= $4::date)
            ${whereClause}
        )
        SELECT
          COALESCE(m.mtd_quantity, 0) as total_mtd_quantity,
          COALESCE(m.mtd_amount, 0) as total_mtd_revenue,
          COALESCE(l.lmtd_quantity, 0) as total_lmtd_quantity,
          COALESCE(l.lmtd_amount, 0) as total_lmtd_revenue,
          uc.unique_stores,
          uc.unique_products,
          uc.unique_users,
          uc.unique_team_leaders
        FROM mtd_sales m
        CROSS JOIN lmtd_sales l
        CROSS JOIN unique_counts uc
      `
    }

    // Daily trend query - separate aggregations for MTD and LMTD by day of month
    let dailyTrendQueryText: string
    if (isTblTrxHeader) {
      dailyTrendQueryText = `
        WITH mtd_daily AS (
          SELECT
            EXTRACT(DAY FROM DATE(t."TrxDate"))::int as day_of_month,
            SUM(COALESCE(t."TotalAmount", 0)) as revenue
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          WHERE DATE(t."TrxDate") >= $1::date
            AND DATE(t."TrxDate") <= $2::date
            AND t."TrxType" = 1
            ${whereClause}
          GROUP BY EXTRACT(DAY FROM DATE(t."TrxDate"))
        ),
        lmtd_daily AS (
          SELECT
            EXTRACT(DAY FROM DATE(t."TrxDate"))::int as day_of_month,
            SUM(COALESCE(t."TotalAmount", 0)) as revenue
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          WHERE DATE(t."TrxDate") >= $3::date
            AND DATE(t."TrxDate") <= $4::date
            AND t."TrxType" = 1
            ${whereClause}
          GROUP BY EXTRACT(DAY FROM DATE(t."TrxDate"))
        )
        SELECT
          COALESCE(m.day_of_month, l.day_of_month) as day,
          COALESCE(m.revenue, 0) as mtd_revenue,
          COALESCE(l.revenue, 0) as lmtd_revenue
        FROM mtd_daily m
        FULL OUTER JOIN lmtd_daily l ON m.day_of_month = l.day_of_month
        ORDER BY COALESCE(m.day_of_month, l.day_of_month)
      `
    } else {
      dailyTrendQueryText = `
        WITH mtd_daily AS (
          SELECT
            EXTRACT(DAY FROM DATE(t.transaction_date))::int as day_of_month,
            SUM(COALESCE(t.net_amount, 0)) as revenue
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $1::date
            AND DATE(t.transaction_date) <= $2::date
            ${whereClause}
          GROUP BY EXTRACT(DAY FROM DATE(t.transaction_date))
        ),
        lmtd_daily AS (
          SELECT
            EXTRACT(DAY FROM DATE(t.transaction_date))::int as day_of_month,
            SUM(COALESCE(t.net_amount, 0)) as revenue
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $3::date
            AND DATE(t.transaction_date) <= $4::date
            ${whereClause}
          GROUP BY EXTRACT(DAY FROM DATE(t.transaction_date))
        )
        SELECT
          COALESCE(m.day_of_month, l.day_of_month) as day,
          COALESCE(m.revenue, 0) as mtd_revenue,
          COALESCE(l.revenue, 0) as lmtd_revenue
        FROM mtd_daily m
        FULL OUTER JOIN lmtd_daily l ON m.day_of_month = l.day_of_month
        ORDER BY COALESCE(m.day_of_month, l.day_of_month)
      `
    }

    // Top products query - aggregate by product from transaction details
    let topProductsQueryText: string
    if (isTblTrxHeader) {
      topProductsQueryText = `
        WITH mtd_products AS (
          SELECT
            d."ItemCode" as product_code,
            COALESCE(MAX(d."ItemDescription"), MAX(i."Description"), d."ItemCode") as product_name,
            SUM(COALESCE(d."BasePrice", 0) * COALESCE(d."QuantityBU", 0)) as revenue
          FROM ${transactionsTable} h
          INNER JOIN "tblTrxDetail" d ON h."TrxCode" = d."TrxCode"
          LEFT JOIN "tblItem" i ON d."ItemCode" = i."Code"
          LEFT JOIN "tblCustomer" c ON h."ClientCode" = c."Code"
          WHERE DATE(h."TrxDate") >= $1::date
            AND DATE(h."TrxDate") <= $2::date
            AND h."TrxType" = 1
            AND d."ItemCode" IS NOT NULL
            ${whereClause}
          GROUP BY d."ItemCode"
        ),
        lmtd_products AS (
          SELECT
            d."ItemCode" as product_code,
            COALESCE(MAX(d."ItemDescription"), MAX(i."Description"), d."ItemCode") as product_name,
            SUM(COALESCE(d."BasePrice", 0) * COALESCE(d."QuantityBU", 0)) as revenue
          FROM ${transactionsTable} h
          INNER JOIN "tblTrxDetail" d ON h."TrxCode" = d."TrxCode"
          LEFT JOIN "tblItem" i ON d."ItemCode" = i."Code"
          LEFT JOIN "tblCustomer" c ON h."ClientCode" = c."Code"
          WHERE DATE(h."TrxDate") >= $3::date
            AND DATE(h."TrxDate") <= $4::date
            AND h."TrxType" = 1
            AND d."ItemCode" IS NOT NULL
            ${whereClause}
          GROUP BY d."ItemCode"
        )
        SELECT
          COALESCE(m.product_code, l.product_code) as product_code,
          COALESCE(m.product_name, l.product_name) as product_name,
          COALESCE(m.revenue, 0) as mtd_revenue,
          COALESCE(l.revenue, 0) as lmtd_revenue
        FROM mtd_products m
        FULL OUTER JOIN lmtd_products l ON m.product_code = l.product_code
        WHERE COALESCE(m.revenue, 0) > 0 OR COALESCE(l.revenue, 0) > 0
        ORDER BY COALESCE(m.revenue, 0) DESC
        LIMIT 10
      `
    } else {
      topProductsQueryText = `
        WITH mtd_products AS (
          SELECT
            t.product_code,
            COALESCE(MAX(p.product_name), t.product_code) as product_name,
            SUM(COALESCE(t.net_amount, 0)) as revenue
          FROM flat_transactions t
          LEFT JOIN flat_products_master p ON t.product_code = p.product_code
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $1::date
            AND DATE(t.transaction_date) <= $2::date
            AND t.product_code IS NOT NULL
            ${whereClause}
          GROUP BY t.product_code
        ),
        lmtd_products AS (
          SELECT
            t.product_code,
            COALESCE(MAX(p.product_name), t.product_code) as product_name,
            SUM(COALESCE(t.net_amount, 0)) as revenue
          FROM flat_transactions t
          LEFT JOIN flat_products_master p ON t.product_code = p.product_code
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE DATE(t.transaction_date) >= $3::date
            AND DATE(t.transaction_date) <= $4::date
            AND t.product_code IS NOT NULL
            ${whereClause}
          GROUP BY t.product_code
        )
        SELECT
          COALESCE(m.product_code, l.product_code) as product_code,
          COALESCE(m.product_name, l.product_name) as product_name,
          COALESCE(m.revenue, 0) as mtd_revenue,
          COALESCE(l.revenue, 0) as lmtd_revenue
        FROM mtd_products m
        FULL OUTER JOIN lmtd_products l ON m.product_code = l.product_code
        WHERE COALESCE(m.revenue, 0) > 0 OR COALESCE(l.revenue, 0) > 0
        ORDER BY COALESCE(m.revenue, 0) DESC
        LIMIT 10
      `
    }

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
      source: isTblTrxHeader ? 'tblTrxHeader' : 'flat_transactions'
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

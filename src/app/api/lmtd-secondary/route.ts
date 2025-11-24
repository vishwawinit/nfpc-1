import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { unstable_cache } from 'next/cache'
import { generateFilterCacheKey, getCacheControlHeader, getCacheDuration } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Internal function to fetch LMTD data (will be cached)
async function fetchLMTDDataInternal(params: {
  mtdStart: string
  mtdEnd: string
  lmtdStart: string
  lmtdEnd: string
  whereClause: string
  filterParams: any[]
  page: number
  limit: number
  offset: number
}) {
  // Use the query function from the module scope
  const { query: dbQuery } = await import('@/lib/database')
  const { mtdStart, mtdEnd, lmtdStart, lmtdEnd, whereClause, filterParams, page, limit, offset } = params

  // Main query - get detailed transaction data
  const queryText = `
    WITH mtd_sales AS (
      -- Current month sales aggregated by date, user, store, product
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
      -- Last month sales aggregated by date, user, store, product
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
      m.sale_date as "mtdDate",
      l.sale_date as "lmtdDate",
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
      AND (m.sale_date IS NULL OR l.sale_date IS NULL OR EXTRACT(DAY FROM m.sale_date) = EXTRACT(DAY FROM l.sale_date))
    WHERE COALESCE(m.mtd_amount, 0) > 0 OR COALESCE(l.lmtd_amount, 0) > 0
    ORDER BY 
      COALESCE(m.sale_date, l.sale_date) DESC,
      COALESCE(m.tl_code, l.tl_code),
      COALESCE(m.field_user_code, l.field_user_code),
      COALESCE(m.store_code, l.store_code),
      COALESCE(m.product_code, l.product_code)
  `

  // Get total count for pagination
  const countQueryText = `
    WITH mtd_sales AS (
      SELECT
        t.user_code as field_user_code,
        t.customer_code as store_code,
        t.product_code
      FROM flat_transactions t
      LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
      WHERE DATE(t.transaction_date) >= $1::date 
        AND DATE(t.transaction_date) <= $2::date
        ${whereClause}
      GROUP BY 
        DATE(t.transaction_date), t.user_code, t.customer_code, t.product_code
    ),
    lmtd_sales AS (
      SELECT
        t.user_code as field_user_code,
        t.customer_code as store_code,
        t.product_code
      FROM flat_transactions t
      LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
      WHERE DATE(t.transaction_date) >= $3::date 
        AND DATE(t.transaction_date) <= $4::date
        ${whereClause}
      GROUP BY 
        DATE(t.transaction_date), t.user_code, t.customer_code, t.product_code
    )
    SELECT COUNT(*) as total
    FROM (
      SELECT DISTINCT
        COALESCE(m.field_user_code, l.field_user_code) as field_user_code,
        COALESCE(m.store_code, l.store_code) as store_code,
        COALESCE(m.product_code, l.product_code) as product_code
      FROM mtd_sales m
      FULL OUTER JOIN lmtd_sales l ON 
        m.field_user_code = l.field_user_code
        AND m.store_code = l.store_code
        AND m.product_code = l.product_code
    ) combined
  `

  // Summary query
  const summaryQueryText = `
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

  // Calculate parameter positions for LIMIT and OFFSET
  // Parameters: $1-$4 are dates, then filterParams, then limit and offset
  const limitParamIndex = filterParams.length + 5
  const offsetParamIndex = filterParams.length + 6
  
  // Add pagination to main query
  const paginatedQueryText = queryText + ` LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`

  // Execute all queries in parallel with error handling
  let countResult, dataResult, summaryResult
  try {
    [countResult, dataResult, summaryResult] = await Promise.all([
      dbQuery(countQueryText, [mtdStart, mtdEnd, lmtdStart, lmtdEnd, ...filterParams]),
      dbQuery(paginatedQueryText, [mtdStart, mtdEnd, lmtdStart, lmtdEnd, ...filterParams, limit, offset]),
      dbQuery(summaryQueryText, [mtdStart, mtdEnd, lmtdStart, lmtdEnd, ...filterParams])
    ])
  } catch (queryError) {
    console.error('Query execution error in fetchLMTDDataInternal:', queryError)
    console.error('Query details:', {
      whereClause,
      filterParamsCount: filterParams.length,
      filterParams,
      mtdStart,
      mtdEnd,
      lmtdStart,
      lmtdEnd
    })
    throw queryError
  }
  
  const total = parseInt(countResult.rows[0]?.total || '0')
  const totalPages = Math.ceil(total / limit)

  // Parse detailed data
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

  const summary: any = {
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
    transactionCount: total
  }

  // Calculate variance percentages for summary
  summary.revenueVariancePercent = totalLmtdRevenue > 0 
    ? parseFloat(((totalMtdRevenue - totalLmtdRevenue) / totalLmtdRevenue * 100).toFixed(2))
    : totalMtdRevenue > 0 ? 100 : 0

  summary.quantityVariancePercent = totalLmtdQuantity > 0
    ? parseFloat(((totalMtdQuantity - totalLmtdQuantity) / totalLmtdQuantity * 100).toFixed(2))
    : totalMtdQuantity > 0 ? 100 : 0

  return {
    data: detailedData,
    summary,
    total,
    totalPages
  }
}

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
    
    // Pagination parameters - default to reasonable page size
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200) // Max 200 per page
    const offset = (page - 1) * limit
    
    // Authentication removed - no user validation needed for localhost

    // Calculate date ranges
    // Use endDate if provided, otherwise use current date
    const selectedEndDate = endDate || currentDate
    const [year, month, day] = selectedEndDate.split('-').map(Number)
    
    // MTD: Always from 1st of current month (based on endDate) to the endDate
    const mtdStart = `${year}-${String(month).padStart(2, '0')}-01`
    const mtdEnd = selectedEndDate

    // LMTD: Always the entire previous month relative to the endDate
    // Calculate previous month and year
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    
    // Get the last day of previous month
    const lastDayOfPrevMonth = new Date(year, month - 1, 0).getDate()
    
    const lmtdStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
    const lmtdEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`

    console.log('LMTD Secondary Sales API - Date Ranges:', {
      mtdPeriod: { start: mtdStart, end: mtdEnd },
      lmtdPeriod: { start: lmtdStart, end: lmtdEnd }
    })

    // Build filter conditions
    let filterConditions = []
    let params = []
    let paramIndex = 5 // Starting after the 4 date parameters

    // Authentication removed - no hierarchy filtering

    if (teamLeaderCode) {
      filterConditions.push(`c.sales_person_code = $${paramIndex}`)
      params.push(teamLeaderCode)
      paramIndex++
    }

    if (userCode) {
      filterConditions.push(`t.user_code = $${paramIndex}`)
      params.push(userCode)
      paramIndex++
    }

    if (storeCode) {
      filterConditions.push(`t.customer_code = $${paramIndex}`)
      params.push(storeCode)
      paramIndex++
    }

    if (chainName) {
      filterConditions.push(`c.customer_type = $${paramIndex}`)
      params.push(chainName)
      paramIndex++
    }

    if (productCategory) {
      // Join with product master to get category
      filterConditions.push(`t.product_code IN (SELECT product_code FROM flat_products_master WHERE product_category = $${paramIndex})`)
      params.push(productCategory)
      paramIndex++
    }

    if (productCode) {
      filterConditions.push(`t.product_code = $${paramIndex}`)
      params.push(productCode)
      paramIndex++
    }

    // Build whereClause - ensure it starts with AND and has proper spacing
    const whereClause = filterConditions.length > 0 
      ? ' AND ' + filterConditions.join(' AND ') 
      : ''
    
    console.log('LMTD Secondary Sales API - Filter Details:', {
      filterConditionsCount: filterConditions.length,
      paramsCount: params.length,
      whereClause: whereClause.substring(0, 100), // Log first 100 chars
      paramIndex
    })

    // Build cache key for caching
    const filterParams = {
      startDate: endDate || currentDate,
      teamLeaderCode: teamLeaderCode || '',
      userCode: userCode || '',
      storeCode: storeCode || '',
      chainName: chainName || '',
      productCategory: productCategory || '',
      productCode: productCode || '',
      page: page.toString(),
      limit: limit.toString()
    }
    const cacheKey = generateFilterCacheKey('lmtd-secondary', filterParams)
    const cacheDuration = 1800 // 30 minutes

    // Fetch data with caching and error handling
    let result
    try {
      const cachedFetchData = unstable_cache(
        async () => fetchLMTDDataInternal({
          mtdStart,
          mtdEnd,
          lmtdStart,
          lmtdEnd,
          whereClause,
          filterParams: params,
          page,
          limit,
          offset
        }),
        [cacheKey],
        {
          revalidate: cacheDuration,
          tags: ['lmtd-secondary']
        }
      )

      result = await cachedFetchData()
    } catch (cacheError) {
      console.error('Error in cached fetch, attempting direct fetch:', cacheError)
      // If caching fails, try direct fetch
      result = await fetchLMTDDataInternal({
        mtdStart,
        mtdEnd,
        lmtdStart,
        lmtdEnd,
        whereClause,
        filterParams: params,
        page,
        limit,
        offset
      })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      summary: result.summary,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: page < result.totalPages,
        hasPrevPage: page > 1
      },
      periods: {
        mtd: { start: mtdStart, end: mtdEnd },
        lmtd: { start: lmtdStart, end: lmtdEnd }
      },
      timestamp: new Date().toISOString(),
      cached: true,
      cacheInfo: {
        duration: cacheDuration
      },
      source: 'postgresql-flat-tables (flat_transactions)'
    }, {
      headers: {
        'Cache-Control': getCacheControlHeader(cacheDuration)
      }
    })

  } catch (error) {
    console.error('LMTD Secondary Sales API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      cause: error instanceof Error ? (error as any).cause : undefined
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch LMTD secondary sales data',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' 
        ? (error instanceof Error ? error.toString() : 'Unknown error')
        : 'Internal server error'
    }, { status: 500 })
  }
}

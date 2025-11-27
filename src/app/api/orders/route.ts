import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Intelligent caching based on date range
function getCacheDuration(dateRange: string, hasCustomDates: boolean): number {
  if (hasCustomDates) return 900
  switch(dateRange) {
    case 'today':
    case 'yesterday':
      return 600
    case 'thisWeek':
      return 900
    case 'thisMonth':
      return 1800
    case 'lastMonth':
    case 'thisQuarter':
    case 'lastQuarter':
      return 3600
    default:
      return 900
  }
}

// Date range helper
function getDateRange(rangeStr: string) {
  const now = new Date()
  let startDate: Date, endDate: Date

  switch (rangeStr) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.setHours(23, 59, 59, 999))
      break
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      startDate = new Date(yesterday.setHours(0, 0, 0, 0))
      endDate = new Date(yesterday.setHours(23, 59, 59, 999))
      break
    case 'thisWeek':
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      startDate = new Date(weekStart.setHours(0, 0, 0, 0))
      endDate = new Date(now)
      break
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
      break
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
      endDate = new Date(now)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1
      startDate = new Date(now.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(now.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
  }

  return {
    startStr: startDate.toISOString().split('T')[0],
    endStr: endDate.toISOString().split('T')[0]
  }
}

export async function GET(request: NextRequest) {
  try {
    await db.initialize()

    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Filters
    const regionFilter = searchParams.get('region')
    const cityFilter = searchParams.get('city')
    const chainFilter = searchParams.get('chain')
    const customerFilter = searchParams.get('customer')
    const salesmanFilter = searchParams.get('salesman')
    const teamLeaderFilter = searchParams.get('teamLeader')
    const categoryFilter = searchParams.get('category')
    const searchQuery = searchParams.get('search')
    const loginUserCode = searchParams.get('loginUserCode')

    // Get hierarchy-based allowed users
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
    }

    let startDate: string, endDate: string

    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const dateResult = getDateRange(range)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
    }

    // Build WHERE clause
    let whereConditions = [
      `t."TrxType" = 1`,
      `DATE(t."TrxDate") >= '${startDate}'`,
      `DATE(t."TrxDate") <= '${endDate}'`
    ]

    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      whereConditions.push(`t."UserCode" IN (${userCodesStr})`)
    }

    if (regionFilter && regionFilter !== 'all') {
      whereConditions.push(`c."RegionCode" = '${regionFilter}'`)
    }
    if (cityFilter && cityFilter !== 'all') {
      whereConditions.push(`c."CityCode" = '${cityFilter}'`)
    }
    if (chainFilter && chainFilter !== 'all') {
      whereConditions.push(`c."JDECustomerType" = '${chainFilter}'`)
    }
    if (customerFilter && customerFilter !== 'all') {
      whereConditions.push(`t."ClientCode" = '${customerFilter}'`)
    }
    if (salesmanFilter && salesmanFilter !== 'all') {
      whereConditions.push(`t."UserCode" = '${salesmanFilter}'`)
    }
    if (teamLeaderFilter && teamLeaderFilter !== 'all') {
      whereConditions.push(`c."SalesmanCode" = '${teamLeaderFilter}'`)
    }
    if (searchQuery) {
      whereConditions.push(`(
        t."ClientCode" ILIKE '%${searchQuery}%' OR
        c."Description" ILIKE '%${searchQuery}%' OR
        t."TrxCode" ILIKE '%${searchQuery}%'
      )`)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Get summary metrics with proper joins
    const metricsQuery = `
      WITH transaction_totals AS (
        SELECT
          t."TrxCode",
          SUM(ABS(COALESCE(d."QuantityBU", 0))) as trx_quantity
        FROM "tblTrxHeader" t
        LEFT JOIN "tblTrxDetail" d ON t."TrxCode" = d."TrxCode"
        LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
        ${whereClause}
        GROUP BY t."TrxCode"
      )
      SELECT
        (SELECT COUNT(DISTINCT t."TrxCode")
         FROM "tblTrxHeader" t
         LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
         ${whereClause}) as "totalOrders",
        (SELECT COUNT(DISTINCT t."ClientCode")
         FROM "tblTrxHeader" t
         LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
         ${whereClause}) as "totalCustomers",
        (SELECT COUNT(DISTINCT d."ItemCode")
         FROM "tblTrxHeader" t
         LEFT JOIN "tblTrxDetail" d ON t."TrxCode" = d."TrxCode"
         LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
         ${whereClause}) as "totalProducts",
        (SELECT SUM(COALESCE(t."TotalAmount", 0))
         FROM "tblTrxHeader" t
         LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
         ${whereClause}) as "totalSales",
        (SELECT AVG(COALESCE(t."TotalAmount", 0))
         FROM "tblTrxHeader" t
         LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
         ${whereClause}) as "avgOrderValue",
        (SELECT SUM(COALESCE(trx_quantity, 0))
         FROM transaction_totals) as "totalQuantity"
    `

    const metricsResult = await query(metricsQuery, [])
    const metrics = metricsResult.rows[0]

    // Get orders with proper joins for descriptive names
    const ordersQuery = `
      WITH transaction_quantities AS (
        SELECT
          "TrxCode",
          SUM(ABS(COALESCE("QuantityBU", 0))) as total_quantity,
          COUNT(DISTINCT "ItemCode") as item_count
        FROM "tblTrxDetail"
        GROUP BY "TrxCode"
      )
      SELECT
        t."TrxCode" as "orderCode",
        DATE(t."TrxDate") as "orderDate",
        t."ClientCode" as "customerCode",
        COALESCE(c."Description", 'Unknown') as "customerName",
        COALESCE(reg."Description", c."RegionCode", 'Unknown') as "region",
        COALESCE(city."Description", c."CityCode", 'Unknown') as "city",
        COALESCE(chn."Description", c."JDECustomerType", 'Unknown') as "chain",
        COALESCE(sales_user."Description", t."UserCode", 'Unknown') as "salesman",
        t."UserCode" as "salesmanCode",
        COALESCE(tl_user."Description", c."SalesmanCode", 'Unknown') as "teamLeader",
        c."SalesmanCode" as "teamLeaderCode",
        COALESCE(tq.item_count, 0) as "itemCount",
        COALESCE(tq.total_quantity, 0) as "totalQuantity",
        COALESCE(t."TotalAmount", 0) as "orderTotal"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblRegion" reg ON c."RegionCode" = reg."Code"
      LEFT JOIN "tblCity" city ON c."CityCode" = city."Code"
      LEFT JOIN "tblChannel" chn ON c."JDECustomerType" = chn."Code"
      LEFT JOIN "tblUser" sales_user ON t."UserCode" = sales_user."Code"
      LEFT JOIN "tblUser" tl_user ON c."SalesmanCode" = tl_user."Code"
      LEFT JOIN transaction_quantities tq ON t."TrxCode" = tq."TrxCode"
      ${whereClause}
      ORDER BY DATE(t."TrxDate") DESC, t."TrxCode" DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const ordersResult = await query(ordersQuery, [])

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT t."TrxCode") as total
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      ${whereClause}
    `

    const countResult = await query(countQuery, [])
    const totalOrders = parseInt(countResult.rows[0].total)

    // Category filter for products
    const categoryWhereClause = categoryFilter && categoryFilter !== 'all'
      ? whereClause + ` AND p."ProductGroup" = '${categoryFilter}'`
      : whereClause

    // Get region-wise data for chart
    const regionWiseQuery = `
      SELECT
        COALESCE(reg."Description", c."RegionCode", 'Unknown') as "region",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(COALESCE(t."TotalAmount", 0)) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblRegion" reg ON c."RegionCode" = reg."Code"
      ${whereClause}
      GROUP BY reg."Description", c."RegionCode"
      ORDER BY "totalSales" DESC
      LIMIT 10
    `

    const regionWiseResult = await query(regionWiseQuery, [])

    // Get city-wise data for chart
    const cityWiseQuery = `
      SELECT
        COALESCE(city."Description", c."CityCode", 'Unknown') as "city",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(COALESCE(t."TotalAmount", 0)) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblCity" city ON c."CityCode" = city."Code"
      ${whereClause}
      GROUP BY city."Description", c."CityCode"
      ORDER BY "totalSales" DESC
      LIMIT 10
    `

    const cityWiseResult = await query(cityWiseQuery, [])

    // Get chain-wise data for chart
    const chainWiseQuery = `
      SELECT
        COALESCE(chn."Description", c."JDECustomerType", 'Unknown') as "chain",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(COALESCE(t."TotalAmount", 0)) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblChannel" chn ON c."JDECustomerType" = chn."Code"
      ${whereClause}
      GROUP BY chn."Description", c."JDECustomerType"
      ORDER BY "totalSales" DESC
      LIMIT 10
    `

    const chainWiseResult = await query(chainWiseQuery, [])

    // Get top customers by orders
    const topCustomersQuery = `
      SELECT
        t."ClientCode" as "customerCode",
        MAX(COALESCE(c."Description", 'Unknown')) as "customerName",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(COALESCE(t."TotalAmount", 0)) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      ${whereClause}
      GROUP BY t."ClientCode"
      ORDER BY "orderCount" DESC
      LIMIT 10
    `

    const topCustomersResult = await query(topCustomersQuery, [])

    // Get top products by sales (without tblProduct since it doesn't exist)
    const topProductsQuery = `
      SELECT
        d."ItemCode" as "productCode",
        MAX(d."ItemDescription") as "productName",
        COALESCE(MAX(i."GroupLevel1"), 'N/A') as "category",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(ABS(COALESCE(d."QuantityBU", 0))) as "totalQuantity",
        SUM(CASE WHEN (d."BasePrice" * d."QuantityBU") > 0 THEN (d."BasePrice" * d."QuantityBU") ELSE 0 END) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblTrxDetail" d ON t."TrxCode" = d."TrxCode"
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblItem" i ON d."ItemCode" = i."Code"
      ${whereClause}
      GROUP BY d."ItemCode"
      ORDER BY "totalSales" DESC
      LIMIT 10
    `

    const topProductsResult = await query(topProductsQuery, [])

    // Get category-wise sales data from tblItem
    const categoryWiseQuery = `
      SELECT
        COALESCE(i."GroupLevel1", 'Uncategorized') as "category",
        COUNT(DISTINCT t."TrxCode") as "orderCount",
        SUM(ABS(COALESCE(d."QuantityBU", 0))) as "totalQuantity",
        SUM(CASE WHEN (d."BasePrice" * d."QuantityBU") > 0 THEN (d."BasePrice" * d."QuantityBU") ELSE 0 END) as "totalSales"
      FROM "tblTrxHeader" t
      LEFT JOIN "tblTrxDetail" d ON t."TrxCode" = d."TrxCode"
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblItem" i ON d."ItemCode" = i."Code"
      ${whereClause}
      GROUP BY i."GroupLevel1"
      HAVING SUM(CASE WHEN (d."BasePrice" * d."QuantityBU") > 0 THEN (d."BasePrice" * d."QuantityBU") ELSE 0 END) > 0
      ORDER BY "totalSales" DESC
      LIMIT 10
    `

    const categoryWiseResult = await query(categoryWiseQuery, [])
    const categoryWiseData = categoryWiseResult.rows

    return NextResponse.json({
      success: true,
      data: {
        orders: ordersResult.rows,
        metrics: {
          totalOrders: parseInt(metrics.totalOrders || '0'),
          totalCustomers: parseInt(metrics.totalCustomers || '0'),
          totalProducts: parseInt(metrics.totalProducts || '0'),
          totalSales: parseFloat(metrics.totalSales || '0'),
          avgOrderValue: parseFloat(metrics.avgOrderValue || '0'),
          totalQuantity: parseInt(metrics.totalQuantity || '0')
        },
        charts: {
          regionWise: regionWiseResult.rows,
          cityWise: cityWiseResult.rows,
          chainWise: chainWiseResult.rows,
          topCustomers: topCustomersResult.rows,
          topProducts: topProductsResult.rows,
          categoryWise: categoryWiseData
        },
        pagination: {
          page,
          limit,
          total: totalOrders,
          totalPages: Math.ceil(totalOrders / limit),
          hasNextPage: page < Math.ceil(totalOrders / limit),
          hasPrevPage: page > 1,
          showing: `${offset + 1}-${Math.min(offset + limit, totalOrders)} of ${totalOrders} orders`
        }
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: range
      },
      cached: true,
      cacheInfo: {
        duration: getCacheDuration(range, !!(searchParams.get('startDate') && searchParams.get('endDate'))),
        dateRange: range
      }
    }, {
      headers: {
        'Cache-Control': `public, s-maxage=${getCacheDuration(range, !!(searchParams.get('startDate') && searchParams.get('endDate')))}, stale-while-revalidate=${getCacheDuration(range, !!(searchParams.get('startDate') && searchParams.get('endDate'))) * 2}`
      }
    })

  } catch (error) {
    console.error('Orders API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

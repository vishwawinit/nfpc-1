import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

export const dynamic = 'force-dynamic'
export const revalidate = 0 // Disable static generation, use Next.js caching headers instead

const SALES_TABLE = 'flat_daily_sales_report'

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDateRangeFromString = (dateRange: string) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  let startDate: Date, endDate: Date

  switch(dateRange) {
    case 'today': startDate = new Date(year, month, day); endDate = new Date(year, month, day); break
    case 'yesterday': startDate = new Date(year, month, day - 1); endDate = new Date(year, month, day - 1); break
    case 'last7Days': startDate = new Date(year, month, day - 6); endDate = new Date(year, month, day); break
    case 'last30Days': startDate = new Date(year, month, day - 29); endDate = new Date(year, month, day); break
    case 'thisMonth': startDate = new Date(year, month, 1); endDate = new Date(year, month, day); break
    case 'lastMonth': startDate = new Date(year, month - 1, 1); endDate = new Date(year, month, 0); break
    case 'thisQuarter': const q = Math.floor(month / 3); startDate = new Date(year, q * 3, 1); endDate = new Date(year, month, day); break
    case 'thisYear': startDate = new Date(year, 0, 1); endDate = new Date(year, month, day); break
    default: startDate = new Date(year, month - 1, 1); endDate = new Date(year, month, 0)
  }

  return { startDate, endDate }
}

const buildWhereClause = (params: any) => {
  const cond: string[] = []
  if (params.startDate) cond.push(`trx_trxdate >= '${params.startDate} 00:00:00'::timestamp`)
  if (params.endDate) cond.push(`trx_trxdate < ('${params.endDate}'::date + INTERVAL '1 day')`)
  cond.push(`trx_trxtype = 4`)
  if (params.regionCode && params.regionCode !== 'all') cond.push(`route_areacode = '${params.regionCode}'`)
  if (params.routeCode && params.routeCode !== 'all') cond.push(`trx_routecode = '${params.routeCode}'`)
  if (params.salesmanCode && params.salesmanCode !== 'all') cond.push(`trx_usercode = '${params.salesmanCode}'`)
  return cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : ''
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'
    const regionCode = searchParams.get('region') || 'all'
    const routeCode = searchParams.get('route') || 'all'
    const salesmanCode = searchParams.get('salesman') || 'all'

    const { startDate, endDate } = getDateRangeFromString(dateRange)
    const filterParams = {
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      regionCode, routeCode, salesmanCode
    }

    const whereClause = buildWhereClause(filterParams)

    console.log('🔍 Returns Query - Start:', new Date().toISOString())
    console.log('📋 Filters:', filterParams)

    // DB-OPTIMIZED: Single CTE scan with all derivations
    // Transaction amounts for summaries, line amounts for product/brand breakdowns
    const optimizedQuery = `
      WITH returns AS (
        SELECT
          trx_usercode,
          user_description,
          customer_code,
          customer_channel_description,
          trx_trxdate::date as trx_date,
          trx_collectiontype,
          ABS(trx_totalamount) as amount,
          line_itemcode,
          line_itemdescription,
          item_brand_description
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= '${filterParams.startDate}'::date
          AND trx_trxdate <= '${filterParams.endDate}'::date
          AND trx_trxtype = 4
          ${regionCode && regionCode !== 'all' ? `AND route_areacode = '${regionCode}'` : ''}
          ${routeCode && routeCode !== 'all' ? `AND trx_routecode = '${routeCode}'` : ''}
          ${salesmanCode && salesmanCode !== 'all' ? `AND trx_usercode = '${salesmanCode}'` : ''}
      )
      SELECT
        -- Sales summary (separate query - fast)
        (SELECT json_build_object(
          'total_sales_value', COALESCE(SUM(ABS(trx_totalamount)), 0),
          'total_sales_count', COUNT(*)
        )
        FROM ${SALES_TABLE}
        WHERE trx_trxdate >= '${filterParams.startDate}'::date
          AND trx_trxdate <= '${filterParams.endDate}'::date
          AND trx_trxtype = 1
          ${regionCode && regionCode !== 'all' ? `AND route_areacode = '${regionCode}'` : ''}
          ${routeCode && routeCode !== 'all' ? `AND trx_routecode = '${routeCode}'` : ''}
          ${salesmanCode && salesmanCode !== 'all' ? `AND trx_usercode = '${salesmanCode}'` : ''}
        ) as sales,

        -- Returns summary (from CTE)
        (SELECT json_build_object(
          'good_return_value', COALESCE(SUM(amount) FILTER (WHERE trx_collectiontype = '1'), 0),
          'good_return_count', COUNT(*) FILTER (WHERE trx_collectiontype = '1'),
          'bad_return_value', COALESCE(SUM(amount) FILTER (WHERE trx_collectiontype = '0'), 0),
          'bad_return_count', COUNT(*) FILTER (WHERE trx_collectiontype = '0'),
          'total_return_value', COALESCE(SUM(amount), 0),
          'total_return_count', COUNT(*)
        ) FROM returns) as summary,

        -- Salesman data (from CTE)
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             trx_usercode as salesman_code,
             MAX(user_description) as salesman_name,
             SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             SUM(amount) as return_value,
             COUNT(*) as return_count,
             COUNT(DISTINCT customer_code) as customer_count
           FROM returns
           GROUP BY trx_usercode
         ) x
        ) as salesmen,

        -- Daily trend (from CTE)
        (SELECT json_agg(x ORDER BY date ASC)
         FROM (
           SELECT
             trx_date as date,
             SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(amount) as return_value,
             COUNT(*) as return_count
           FROM returns
           GROUP BY trx_date
         ) x
        ) as trends,

        -- Top 5 Brands by Returns (using transaction amounts)
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             item_brand_description as brand_name,
             SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(DISTINCT customer_code) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(DISTINCT customer_code) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(amount) as return_value,
             COUNT(DISTINCT customer_code) as return_count
           FROM returns
           WHERE item_brand_description IS NOT NULL AND item_brand_description != ''
           GROUP BY item_brand_description
           ORDER BY return_value DESC
           LIMIT 5
         ) x
        ) as brands,

        -- Top 20 Returned Products by Reason (using transaction amounts)
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             line_itemcode as product_code,
             MAX(line_itemdescription) as product_name,
             SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(DISTINCT customer_code) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(DISTINCT customer_code) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(amount) as return_value,
             COUNT(DISTINCT customer_code) as return_count
           FROM returns
           WHERE line_itemcode IS NOT NULL AND line_itemcode != ''
           GROUP BY line_itemcode
           ORDER BY return_value DESC
           LIMIT 20
         ) x
        ) as products,

        -- Returns by Category (customer channel)
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             customer_channel_description as category_name,
             SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(amount) as return_value,
             COUNT(*) as return_count
           FROM returns
           WHERE customer_channel_description IS NOT NULL AND customer_channel_description != ''
           GROUP BY customer_channel_description
           ORDER BY return_value DESC
           LIMIT 10
         ) x
        ) as categories
    `

    const startTime = Date.now()

    // Use a client to ensure statement timeout applies to the query
    const client = await db.getClient()
    try {
      // Set statement timeout to 2 minutes for this connection
      await client.query('SET statement_timeout = 120000')

      const result = await client.query(optimizedQuery)
      const queryTime = Date.now() - startTime
      console.log(`⚡ Query completed in ${queryTime}ms`)

      const data = result.rows[0]
      const salesData = data.sales || { total_sales_value: 0, total_sales_count: 0 }
      const summary = data.summary || { good_return_value: 0, good_return_count: 0, bad_return_value: 0, bad_return_count: 0, total_return_value: 0, total_return_count: 0 }
      const salesmanData = data.salesmen || []
      const trendData = data.trends || []
      const brandData = data.brands || []
      const productData = data.products || []
      const categoryData = data.categories || []

      // Extract sales metrics
      const saleValue = parseFloat(salesData.total_sales_value || 0)
      const saleCount = parseInt(salesData.total_sales_count || 0)
      const returnValue = parseFloat(summary.total_return_value || 0)
      const returnCount = parseInt(summary.total_return_count || 0)

      // Calculate derived metrics
      const returnPercentage = saleValue > 0 ? (returnValue / saleValue) * 100 : 0
      const netSalesValue = saleValue - returnValue
      const netOrderCount = saleCount - returnCount

      const responseData = {
        returnReasons: {
          summary: {
            good_return_value: parseFloat(summary.good_return_value || 0),
            good_return_count: parseInt(summary.good_return_count || 0),
            bad_return_value: parseFloat(summary.bad_return_value || 0),
            bad_return_count: parseInt(summary.bad_return_count || 0),
            total_return_value: returnValue,
            total_return_count: returnCount,
            currency_code: 'AED'
          },
          byBrand: brandData.map((b: any) => ({
            brand_name: b.brand_name,
            good_return_value: parseFloat(b.good_return_value || 0),
            good_return_count: parseInt(b.good_return_count || 0),
            good_return_qty: parseInt(b.good_return_count || 0),
            bad_return_value: parseFloat(b.bad_return_value || 0),
            bad_return_count: parseInt(b.bad_return_count || 0),
            bad_return_qty: parseInt(b.bad_return_count || 0),
            total_return_value: parseFloat(b.return_value || 0),
            return_value: parseFloat(b.return_value || 0),
            return_count: parseInt(b.return_count || 0)
          })),
          byProduct: (() => {
            const flattenedProducts: any[] = []
            productData.forEach((p: any) => {
              // Add GOOD return entry if exists
              if (parseFloat(p.good_return_value || 0) > 0) {
                flattenedProducts.push({
                  product_code: p.product_code,
                  product_name: p.product_name,
                  return_category: 'GOOD',
                  reason: 'Sellable Returns',
                  return_count: parseInt(p.good_return_count || 0),
                  return_value: parseFloat(p.good_return_value || 0),
                  return_qty: parseInt(p.good_return_count || 0),
                  good_return_value: parseFloat(p.good_return_value || 0),
                  good_return_count: parseInt(p.good_return_count || 0)
                })
              }
              // Add BAD return entry if exists
              if (parseFloat(p.bad_return_value || 0) > 0) {
                flattenedProducts.push({
                  product_code: p.product_code,
                  product_name: p.product_name,
                  return_category: 'BAD',
                  reason: 'Wastage',
                  return_count: parseInt(p.bad_return_count || 0),
                  return_value: parseFloat(p.bad_return_value || 0),
                  return_qty: parseInt(p.bad_return_count || 0),
                  bad_return_value: parseFloat(p.bad_return_value || 0),
                  bad_return_count: parseInt(p.bad_return_count || 0)
                })
              }
            })
            // Sort by return_value descending and take top 20
            return flattenedProducts.sort((a, b) => b.return_value - a.return_value).slice(0, 20)
          })()
        },
        periodReturns: {
          summary: {
            sale_value: saleValue,
            sale_count: saleCount,
            good_return_value: parseFloat(summary.good_return_value || 0),
            good_return_count: parseInt(summary.good_return_count || 0),
            bad_return_value: parseFloat(summary.bad_return_value || 0),
            bad_return_count: parseInt(summary.bad_return_count || 0),
            return_value: returnValue,
            return_count: returnCount,
            return_percentage: returnPercentage,
            net_sales_value: netSalesValue,
            net_order_count: netOrderCount,
            currency_code: 'AED'
          },
          byProduct: (() => {
            const flattenedProducts: any[] = []
            productData.forEach((p: any) => {
              // Add GOOD return entry if exists
              if (parseFloat(p.good_return_value || 0) > 0) {
                flattenedProducts.push({
                  product_code: p.product_code,
                  product_name: p.product_name,
                  return_category: 'GOOD',
                  reason: 'Sellable Returns',
                  return_count: parseInt(p.good_return_count || 0),
                  return_value: parseFloat(p.good_return_value || 0),
                  return_qty: parseInt(p.good_return_count || 0)
                })
              }
              // Add BAD return entry if exists
              if (parseFloat(p.bad_return_value || 0) > 0) {
                flattenedProducts.push({
                  product_code: p.product_code,
                  product_name: p.product_name,
                  return_category: 'BAD',
                  reason: 'Wastage',
                  return_count: parseInt(p.bad_return_count || 0),
                  return_value: parseFloat(p.bad_return_value || 0),
                  return_qty: parseInt(p.bad_return_count || 0)
                })
              }
            })
            return flattenedProducts.sort((a, b) => b.return_value - a.return_value).slice(0, 20)
          })(),
          byCategory: categoryData.map((c: any) => ({
            category_name: c.category_name,
            good_return_value: parseFloat(c.good_return_value || 0),
            good_return_count: parseInt(c.good_return_count || 0),
            bad_return_value: parseFloat(c.bad_return_value || 0),
            bad_return_count: parseInt(c.bad_return_count || 0),
            return_value: parseFloat(c.return_value || 0),
            return_count: parseInt(c.return_count || 0)
          })),
          dailyTrend: trendData.map((t: any) => ({
            date: t.date,
            good_return_value: parseFloat(t.good_return_value || 0),
            good_return_count: parseInt(t.good_return_count || 0),
            bad_return_value: parseFloat(t.bad_return_value || 0),
            bad_return_count: parseInt(t.bad_return_count || 0),
            return_value: parseFloat(t.return_value || 0),
            return_count: parseInt(t.return_count || 0)
          }))
        },
        skuReturnPercentage: {
          summary: {
            total_products_with_returns: 0,
            avg_return_rate: 0,
            currency_code: 'AED'
          },
          data: []
        },
        returnOnSales: {
          summary: {
            total_salesmen: salesmanData.length,
            total_return_value: returnValue,
            currency_code: 'AED'
          },
          data: salesmanData.map((s: any) => ({
            salesman_code: s.salesman_code,
            salesman_name: s.salesman_name,
            good_return_value: parseFloat(s.good_return_value || 0),
            bad_return_value: parseFloat(s.bad_return_value || 0),
            return_value: parseFloat(s.return_value || 0),
            return_count: parseInt(s.return_count || 0),
            customer_count: parseInt(s.customer_count || 0)
          }))
        },
        goodReturnsDetail: [],
        badReturnsDetail: []
      }

      const response = NextResponse.json({
        success: true,
        data: responseData,
        metadata: { dateRange, startDate: filterParams.startDate, endDate: filterParams.endDate, filters: { regionCode, routeCode, salesmanCode } },
        timestamp: new Date().toISOString()
      })

      // Cache for 5 minutes - data loads fast now
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600, max-age=180')
      return response
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Returns & Wastage API error:', error)

    // Check if it's a timeout error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('57014')

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch returns and wastage data',
      message: errorMessage,
      hint: isTimeout ? 'Query timed out. Please create database indexes by running: create_returns_indexes.sql' : undefined
    }, { status: 500 })
  }
}

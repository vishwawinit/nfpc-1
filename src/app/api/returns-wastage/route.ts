import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { apiCache } from '@/lib/apiCache'

export const dynamic = 'force-dynamic'
export const revalidate = false // Disable automatic revalidation, use manual caching

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

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/returns-wastage', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    const { startDate, endDate } = getDateRangeFromString(dateRange)
    const filterParams = {
      startDate: toLocalDateString(startDate),
      endDate: toLocalDateString(endDate),
      regionCode, routeCode, salesmanCode
    }

    const whereClause = buildWhereClause(filterParams)

    console.log('🔄 Fetching fresh returns data from database...')
    console.log('📋 Filters:', filterParams)

    // DB-OPTIMIZED: Single CTE scan with all derivations
    // Transaction amounts for summaries, line amounts for product/brand breakdowns
    const optimizedQuery = `
      WITH returns AS (
        SELECT
          trx_usercode,
          user_description,
          customer_code,
          customer_description,
          customer_channel_description,
          trx_trxdate::date as trx_date,
          trx_collectiontype,
          ABS(trx_totalamount) as amount,
          ABS(line_baseprice * line_quantitybu) as line_amount,
          line_itemcode,
          line_itemdescription,
          item_brand_description,
          item_description,
          item_grouplevel1,
          line_quantitybu,
          route_subareacode,
          trx_routecode
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

        -- Salesman data (from CTE) with sales and route info
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             r.trx_usercode as salesman_code,
             MAX(r.user_description) as salesman_name,
             MAX(r.route_subareacode) as route_code,
             COALESCE(s.sales_value, 0) as total_sales,
             SUM(r.amount) FILTER (WHERE r.trx_collectiontype = '1') as good_return_value,
             COUNT(*) FILTER (WHERE r.trx_collectiontype = '1') as good_return_count,
             SUM(r.amount) FILTER (WHERE r.trx_collectiontype = '0') as bad_return_value,
             COUNT(*) FILTER (WHERE r.trx_collectiontype = '0') as bad_return_count,
             SUM(r.amount) as return_value,
             COUNT(*) as return_count,
             COUNT(DISTINCT r.customer_code) as customer_count,
             COALESCE(s.sales_value, 0) - SUM(r.amount) as net_sales,
             CASE
               WHEN COALESCE(s.sales_value, 0) > 0
               THEN ROUND((SUM(r.amount) / s.sales_value * 100)::numeric, 1)
               ELSE 0
             END as return_percentage
           FROM returns r
           LEFT JOIN (
             SELECT
               trx_usercode,
               SUM(ABS(trx_totalamount)) as sales_value
             FROM ${SALES_TABLE}
             WHERE trx_trxdate >= '${filterParams.startDate}'::date
               AND trx_trxdate <= '${filterParams.endDate}'::date
               AND trx_trxtype = 1
               ${regionCode && regionCode !== 'all' ? `AND route_areacode = '${regionCode}'` : ''}
               ${routeCode && routeCode !== 'all' ? `AND trx_routecode = '${routeCode}'` : ''}
               ${salesmanCode && salesmanCode !== 'all' ? `AND trx_usercode = '${salesmanCode}'` : ''}
             GROUP BY trx_usercode
           ) s ON r.trx_usercode = s.trx_usercode
           GROUP BY r.trx_usercode, s.sales_value
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

        -- Top 20 Returned Products by Reason (using line amounts)
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             line_itemcode as product_code,
             MAX(line_itemdescription) as product_name,
             MAX(item_brand_description) as brand,
             MAX(customer_channel_description) as customer_channel,
             SUM(ABS(line_quantitybu)) as return_qty,
             SUM(line_amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(ABS(line_quantitybu)) FILTER (WHERE trx_collectiontype = '1') as good_return_qty,
             SUM(line_amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(ABS(line_quantitybu)) FILTER (WHERE trx_collectiontype = '0') as bad_return_qty,
             SUM(line_amount) as return_value,
             COUNT(*) as return_count
           FROM returns
           WHERE line_itemcode IS NOT NULL AND line_itemcode != ''
           GROUP BY line_itemcode
           ORDER BY return_value DESC
           LIMIT 20
         ) x
        ) as products,

        -- Returns by Customer Channel
        (SELECT json_agg(x ORDER BY return_value DESC)
         FROM (
           SELECT
             COALESCE(customer_channel_description, 'Unknown') as channel_name,
             SUM(ABS(line_quantitybu)) as return_qty,
             SUM(line_amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '1') as good_return_count,
             SUM(line_amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
             COUNT(*) FILTER (WHERE trx_collectiontype = '0') as bad_return_count,
             SUM(line_amount) as return_value,
             COUNT(*) as return_count
           FROM returns
           GROUP BY customer_channel_description
           ORDER BY return_value DESC
           LIMIT 10
         ) x
        ) as channels,

        -- SKU-wise Return Percentage (using item_description)
        (SELECT row_to_json(sku_result) FROM (
          SELECT
            (SELECT json_agg(y)
             FROM (
               SELECT
                 sales_sku.item_description as sku_name,
                 sales_sku.line_itemcode as sku_code,
                 sales_sku.customer_channel as category_name,
                 sales_sku.sales_value,
                 sales_sku.sales_count,
                 COALESCE(ret_sku.return_value, 0) as return_value,
                 COALESCE(ret_sku.total_returned, 0) as total_returned,
                 COALESCE(ret_sku.good_return_value, 0) as good_return_value,
                 COALESCE(ret_sku.good_returned, 0) as good_returned,
                 COALESCE(ret_sku.bad_return_value, 0) as bad_return_value,
                 COALESCE(ret_sku.bad_returned, 0) as bad_returned,
                 CASE
                   WHEN sales_sku.sales_value > 0
                   THEN (COALESCE(ret_sku.return_value, 0) / sales_sku.sales_value * 100)
                   ELSE 0
                 END as return_percentage
               FROM (
                 SELECT
                   item_description,
                   line_itemcode,
                   MAX(customer_channel_description) as customer_channel,
                   SUM(ABS(trx_totalamount)) as sales_value,
                   COUNT(DISTINCT trx_trxcode) as sales_count
                 FROM ${SALES_TABLE}
                 WHERE trx_trxdate >= '${filterParams.startDate}'::date
                   AND trx_trxdate <= '${filterParams.endDate}'::date
                   AND trx_trxtype = 1
                   ${regionCode && regionCode !== 'all' ? `AND route_areacode = '${regionCode}'` : ''}
                   ${routeCode && routeCode !== 'all' ? `AND trx_routecode = '${routeCode}'` : ''}
                   ${salesmanCode && salesmanCode !== 'all' ? `AND trx_usercode = '${salesmanCode}'` : ''}
                   AND item_description IS NOT NULL
                   AND item_description != ''
                 GROUP BY item_description, line_itemcode
               ) sales_sku
               LEFT JOIN (
                 SELECT
                   item_description,
                   SUM(amount) as return_value,
                   SUM(ABS(line_quantitybu)) as total_returned,
                   SUM(amount) FILTER (WHERE trx_collectiontype = '1') as good_return_value,
                   SUM(ABS(line_quantitybu)) FILTER (WHERE trx_collectiontype = '1') as good_returned,
                   SUM(amount) FILTER (WHERE trx_collectiontype = '0') as bad_return_value,
                   SUM(ABS(line_quantitybu)) FILTER (WHERE trx_collectiontype = '0') as bad_returned
                 FROM returns
                 WHERE item_description IS NOT NULL
                   AND item_description != ''
                 GROUP BY item_description
               ) ret_sku ON sales_sku.item_description = ret_sku.item_description
               WHERE COALESCE(ret_sku.return_value, 0) > 0
               ORDER BY return_percentage DESC
               LIMIT 50
             ) y
            ) as sku_data,
            (SELECT row_to_json(s)
             FROM (
               SELECT
                 COALESCE(COUNT(DISTINCT ret_summary.item_description), 0) as total_products_with_returns,
                 COALESCE(AVG(
                   CASE
                     WHEN sales_summary.sales_value > 0
                     THEN (ret_summary.return_value / sales_summary.sales_value * 100)
                     ELSE 0
                   END
                 ), 0) as avg_return_rate
               FROM (
                 SELECT
                   item_description,
                   SUM(ABS(trx_totalamount)) as sales_value
                 FROM ${SALES_TABLE}
                 WHERE trx_trxdate >= '${filterParams.startDate}'::date
                   AND trx_trxdate <= '${filterParams.endDate}'::date
                   AND trx_trxtype = 1
                   ${regionCode && regionCode !== 'all' ? `AND route_areacode = '${regionCode}'` : ''}
                   ${routeCode && routeCode !== 'all' ? `AND trx_routecode = '${routeCode}'` : ''}
                   ${salesmanCode && salesmanCode !== 'all' ? `AND trx_usercode = '${salesmanCode}'` : ''}
                   AND item_description IS NOT NULL
                   AND item_description != ''
                 GROUP BY item_description
               ) sales_summary
               INNER JOIN (
                 SELECT
                   item_description,
                   SUM(amount) as return_value
                 FROM returns
                 WHERE item_description IS NOT NULL
                   AND item_description != ''
                 GROUP BY item_description
               ) ret_summary ON sales_summary.item_description = ret_summary.item_description
               WHERE ret_summary.return_value > 0
             ) s
            ) as summary
        ) sku_result) as sku_returns,

        -- Good Returns Detail (Sellable)
        (SELECT json_agg(x ORDER BY trx_date DESC, product_code)
         FROM (
           SELECT
             trx_routecode as trx_code,
             trx_date,
             line_itemcode as product_code,
             line_itemdescription as product_name,
             item_grouplevel1 as category_name,
             item_brand_description as brand,
             customer_code,
             customer_description as customer_name,
             customer_channel_description as customer_channel,
             route_subareacode as area,
             trx_routecode as route_code,
             trx_usercode as salesman_code,
             user_description as salesman_name,
             ABS(line_quantitybu) as quantity,
             line_amount as return_value,
             NULL as return_reason
           FROM returns
           WHERE trx_collectiontype = '1'
           ORDER BY trx_date DESC, line_itemcode
         ) x
        ) as good_returns_detail,

        -- Bad Returns Detail (Wastage)
        (SELECT json_agg(x ORDER BY trx_date DESC, product_code)
         FROM (
           SELECT
             trx_routecode as trx_code,
             trx_date,
             line_itemcode as product_code,
             line_itemdescription as product_name,
             item_grouplevel1 as category_name,
             item_brand_description as brand,
             customer_code,
             customer_description as customer_name,
             customer_channel_description as customer_channel,
             route_subareacode as area,
             trx_routecode as route_code,
             trx_usercode as salesman_code,
             user_description as salesman_name,
             ABS(line_quantitybu) as quantity,
             line_amount as return_value,
             NULL as return_reason
           FROM returns
           WHERE trx_collectiontype = '0'
           ORDER BY trx_date DESC, line_itemcode
         ) x
        ) as bad_returns_detail
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
      const channelData = data.channels || []
      const skuReturns = data.sku_returns || { sku_data: [], summary: { total_products_with_returns: 0, avg_return_rate: 0 } }
      const goodReturnsDetailData = data.good_returns_detail || []
      const badReturnsDetailData = data.bad_returns_detail || []

      console.log('📦 SKU Returns Data:', {
        hasData: !!data.sku_returns,
        skuDataCount: skuReturns.sku_data?.length || 0,
        summary: skuReturns.summary
      })

      console.log('📋 Good/Bad Returns Detail Debug:', {
        goodReturnsCount: goodReturnsDetailData.length,
        badReturnsCount: badReturnsDetailData.length,
        goodSample: goodReturnsDetailData[0],
        badSample: badReturnsDetailData[0]
      })

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
                  brand: p.brand || 'Unknown',
                  category_name: p.category_name || 'Others',
                  return_category: 'GOOD',
                  reason: 'Sellable Returns',
                  return_count: parseInt(p.good_return_count || 0),
                  return_value: parseFloat(p.good_return_value || 0),
                  return_qty: parseFloat(p.good_return_qty || 0),
                  good_return_value: parseFloat(p.good_return_value || 0),
                  good_return_count: parseInt(p.good_return_count || 0)
                })
              }
              // Add BAD return entry if exists
              if (parseFloat(p.bad_return_value || 0) > 0) {
                flattenedProducts.push({
                  product_code: p.product_code,
                  product_name: p.product_name,
                  brand: p.brand || 'Unknown',
                  category_name: p.category_name || 'Others',
                  return_category: 'BAD',
                  reason: 'Wastage',
                  return_count: parseInt(p.bad_return_count || 0),
                  return_value: parseFloat(p.bad_return_value || 0),
                  return_qty: parseFloat(p.bad_return_qty || 0),
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
          byProduct: productData.map((p: any) => ({
            product_code: p.product_code,
            product_name: p.product_name,
            brand: p.brand || 'Unknown',
            customer_channel: p.customer_channel || 'Unknown',
            return_qty: parseFloat(p.return_qty || 0),
            return_value: parseFloat(p.return_value || 0),
            return_count: parseInt(p.return_count || 0),
            good_return_value: parseFloat(p.good_return_value || 0),
            good_return_count: parseInt(p.good_return_count || 0),
            good_return_qty: parseFloat(p.good_return_qty || 0),
            bad_return_value: parseFloat(p.bad_return_value || 0),
            bad_return_count: parseInt(p.bad_return_count || 0),
            bad_return_qty: parseFloat(p.bad_return_qty || 0)
          })),
          byChannel: channelData.map((c: any) => ({
            channel_name: c.channel_name,
            return_qty: parseFloat(c.return_qty || 0),
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
            total_products_with_returns: parseInt(skuReturns.summary?.total_products_with_returns || 0),
            avg_return_rate: parseFloat(skuReturns.summary?.avg_return_rate || 0),
            // Calculate aggregated KPIs from sku_data
            total_sales_value: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.sales_value || 0), 0),
            total_return_value: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.return_value || 0), 0),
            good_return_value: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.good_return_value || 0), 0),
            bad_return_value: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.bad_return_value || 0), 0),
            total_returned: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseInt(sku.total_returned || 0), 0),
            good_returned: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseInt(sku.good_returned || 0), 0),
            bad_returned: (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseInt(sku.bad_returned || 0), 0),
            net_sales_value: (() => {
              const totalSales = (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.sales_value || 0), 0)
              const totalReturns = (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.return_value || 0), 0)
              return totalSales - totalReturns
            })(),
            overall_return_percentage: (() => {
              const totalSales = (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.sales_value || 0), 0)
              const totalReturns = (skuReturns.sku_data || []).reduce((sum: number, sku: any) => sum + parseFloat(sku.return_value || 0), 0)
              return totalSales > 0 ? ((totalReturns / totalSales) * 100) : 0
            })(),
            currency_code: 'AED'
          },
          data: (skuReturns.sku_data || []).map((sku: any) => ({
            product_name: sku.sku_name,
            product_code: sku.sku_code,
            sku_name: sku.sku_name,
            sku_code: sku.sku_code,
            category_name: sku.category_name || 'N/A',
            sales_value: parseFloat(sku.sales_value || 0),
            sales_count: parseInt(sku.sales_count || 0),
            total_returned: parseInt(sku.total_returned || 0),
            return_value: parseFloat(sku.return_value || 0),
            good_return_value: parseFloat(sku.good_return_value || 0),
            good_returned: parseInt(sku.good_returned || 0),
            bad_return_value: parseFloat(sku.bad_return_value || 0),
            bad_returned: parseInt(sku.bad_returned || 0),
            return_percentage: parseFloat(sku.return_percentage || 0).toFixed(2)
          }))
        },
        returnOnSales: {
          summary: {
            total_salesmen: salesmanData.length,
            total_sales: salesmanData.reduce((sum: number, s: any) => sum + parseFloat(s.total_sales || 0), 0),
            total_returns: returnValue,
            good_return_value: parseFloat(summary.good_return_value || 0),
            bad_return_value: parseFloat(summary.bad_return_value || 0),
            net_sales: salesmanData.reduce((sum: number, s: any) => sum + parseFloat(s.total_sales || 0), 0) - returnValue,
            return_percentage: (() => {
              const totalSales = salesmanData.reduce((sum: number, s: any) => sum + parseFloat(s.total_sales || 0), 0)
              return totalSales > 0 ? ((returnValue / totalSales) * 100).toFixed(1) : '0.0'
            })(),
            currency_code: 'AED'
          },
          data: salesmanData.map((s: any) => ({
            salesman_code: s.salesman_code,
            salesman_name: s.salesman_name,
            route_code: s.route_code || 'N/A',
            total_sales: parseFloat(s.total_sales || 0),
            good_return_value: parseFloat(s.good_return_value || 0),
            good_return_count: parseInt(s.good_return_count || 0),
            bad_return_value: parseFloat(s.bad_return_value || 0),
            bad_return_count: parseInt(s.bad_return_count || 0),
            return_value: parseFloat(s.return_value || 0),
            total_returns: parseFloat(s.return_value || 0),
            return_count: parseInt(s.return_count || 0),
            customer_count: parseInt(s.customer_count || 0),
            net_sales: parseFloat(s.net_sales || 0),
            return_percentage: parseFloat(s.return_percentage || 0)
          }))
        },
        goodReturnsDetail: {
          data: goodReturnsDetailData.map((r: any) => ({
            trx_code: r.trx_code || '',
            trx_date: r.trx_date,
            product_code: r.product_code,
            product_name: r.product_name,
            category_name: r.category_name || 'Unknown',
            brand: r.brand || 'Unknown',
            customer_code: r.customer_code,
            customer_name: r.customer_name || r.customer_code,
            customer_channel: r.customer_channel || 'Unknown',
            area: r.area || 'Unknown',
            route_code: r.route_code || '',
            salesman_code: r.salesman_code,
            salesman_name: r.salesman_name || r.salesman_code,
            quantity: parseFloat(r.quantity || 0),
            return_value: parseFloat(r.return_value || 0),
            return_reason: r.return_reason || null
          }))
        },
        badReturnsDetail: {
          data: badReturnsDetailData.map((r: any) => ({
            trx_code: r.trx_code || '',
            trx_date: r.trx_date,
            product_code: r.product_code,
            product_name: r.product_name,
            category_name: r.category_name || 'Unknown',
            brand: r.brand || 'Unknown',
            customer_code: r.customer_code,
            customer_name: r.customer_name || r.customer_code,
            customer_channel: r.customer_channel || 'Unknown',
            area: r.area || 'Unknown',
            route_code: r.route_code || '',
            salesman_code: r.salesman_code,
            salesman_name: r.salesman_name || r.salesman_code,
            quantity: parseFloat(r.quantity || 0),
            return_value: parseFloat(r.return_value || 0),
            return_reason: r.return_reason || null
          }))
        }
      }

      const responseJson = {
        success: true,
        data: responseData,
        metadata: { dateRange, startDate: filterParams.startDate, endDate: filterParams.endDate, filters: { regionCode, routeCode, salesmanCode } },
        timestamp: new Date().toISOString(),
        cached: false
      }

      // Store in cache
      apiCache.set('/api/returns-wastage', searchParams, responseJson)

      const response = NextResponse.json(responseJson)

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

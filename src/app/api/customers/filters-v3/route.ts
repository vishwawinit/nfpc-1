import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Helper to get column-safe expressions for filters
function getFilterColumnExpressions(columns: Set<string>) {
  const has = (column: string) => columns.has(column)

  return {
    storeCode: has('store_code') ? 'store_code' : 'customer_code',
    storeName: has('store_name') ? 'store_name' : 'NULL',
    regionCode: has('region_code') ? 'region_code' : 'NULL',
    regionName: has('region_name') ? 'region_name' : 'NULL',
    cityCode: has('city_code') ? 'city_code' : 'NULL',
    cityName: has('city_name') ? 'city_name' : 'NULL',
    chainCode: has('chain_code') ? 'chain_code' : 'NULL',
    chainName: has('chain_name') ? 'chain_name' : 'NULL',
    tlCode: has('tl_code') ? 'tl_code' : 'NULL',
    tlName: has('tl_name') ? 'tl_name' : 'NULL',
    fieldUserCode: has('field_user_code')
      ? 'field_user_code'
      : has('user_code')
        ? 'user_code'
        : 'NULL',
    fieldUserName: has('field_user_name') ? 'field_user_name' : 'NULL',
    trxCode: has('trx_code') ? 'trx_code' : 'transaction_code',
    trxDateOnly: has('trx_date_only') ? 'trx_date_only' : 'DATE(transaction_date)',
    trxType: has('trx_type') ? 'trx_type' : has('transaction_type') ? 'transaction_type' : '5',
    productGroup: has('product_group_level1') ? 'product_group_level1' : has('product_group') ? 'product_group' : 'NULL',
    productCode: has('product_code') ? 'product_code' : 'NULL'
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    
    await db.initialize()
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getFilterColumnExpressions(tableInfo.columns)
        
    // Authentication removed - no hierarchy filtering
    
    // Get date range
    const current = new Date()
    let startDate: Date, endDate: Date
    
    // Check for custom date range first
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)
    } else {
      switch (range) {
      case 'today':
        startDate = new Date(current.setHours(0, 0, 0, 0))
        endDate = new Date(current.setHours(23, 59, 59, 999))
        break
      case 'yesterday':
        const yesterday = new Date(current)
        yesterday.setDate(yesterday.getDate() - 1)
        startDate = new Date(yesterday.setHours(0, 0, 0, 0))
        endDate = new Date(yesterday.setHours(23, 59, 59, 999))
        break
      case 'thisWeek':
        const weekStart = new Date(current)
        weekStart.setDate(current.getDate() - current.getDay())
        startDate = new Date(weekStart.setHours(0, 0, 0, 0))
        endDate = new Date(current)
        break
      case 'thisMonth':
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        endDate = new Date(current)
        break
      case 'lastMonth':
        startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        endDate = new Date(current.getFullYear(), current.getMonth(), 0)
        break
      case 'thisQuarter':
        const quarter = Math.floor(current.getMonth() / 3)
        startDate = new Date(current.getFullYear(), quarter * 3, 1)
        endDate = new Date(current)
        break
      case 'lastQuarter':
        const lastQuarter = Math.floor(current.getMonth() / 3) - 1
        startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
        endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
        break
      default:
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        endDate = new Date(current)
      }
    }

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]
    
    // Build WHERE clause - Authentication removed
    let whereClause = ''
    
    // Only add trx_type filter if the column exists
    if (col.trxType !== '5') {
      whereClause = `WHERE t.${col.trxType} = 5`
    }
    
    // Date range filters
    const dateExpr = col.trxDateOnly.startsWith('DATE(') 
      ? col.trxDateOnly 
      : `t.${col.trxDateOnly}`
    
    if (whereClause) {
      whereClause += ` AND ${dateExpr} >= '${startStr}' AND ${dateExpr} <= '${endStr}'`
    } else {
      whereClause = `WHERE ${dateExpr} >= '${startStr}' AND ${dateExpr} <= '${endStr}'`
    }

    // Get distinct customers
    const customerNameExpr = col.storeName === 'NULL' ? 'COALESCE(c.customer_name, \'Unknown\')' : `COALESCE(t.${col.storeName}, c.customer_name, 'Unknown')`
    const customersQuery = `
      SELECT
        t.${col.storeCode} as value,
        t.${col.storeCode} || ' - ' || ${customerNameExpr} as label,
        COUNT(DISTINCT t.${col.trxCode}) as count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      AND t.${col.storeCode} IS NOT NULL
      GROUP BY t.${col.storeCode}, ${customerNameExpr}
      ORDER BY count DESC
      LIMIT 100
    `

    // Get distinct regions - Note: flat_customers_master has 'state' column, not 'region_name'
    const regionExpr = col.regionCode === 'NULL' ? 'c.state' : `COALESCE(c.state, t.${col.regionCode}, 'Unknown')`
    const regionNameExpr = col.regionCode === 'NULL' ? 'COALESCE(c.state, \'Unknown\')' : `COALESCE(c.state, t.${col.regionCode}, 'Unknown')`
    const regionsQuery = `
      SELECT
        ${regionExpr} as value,
        ${regionExpr} as label,
        COUNT(DISTINCT t.${col.storeCode}) as count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      AND ${col.regionCode === 'NULL' ? 'c.state' : `COALESCE(c.state, t.${col.regionCode})`} IS NOT NULL
      GROUP BY ${regionExpr}
      ORDER BY value
    `

    // Get distinct cities - Note: flat_customers_master has 'city' column, not 'city_name'
    const cityExpr = col.cityCode === 'NULL' ? 'c.city' : `COALESCE(c.city, t.${col.cityCode}, 'Unknown')`
    const cityNameExpr = col.cityCode === 'NULL' ? 'COALESCE(c.city, \'Unknown\')' : `COALESCE(c.city, t.${col.cityCode}, 'Unknown')`
    const citiesQuery = `
      SELECT
        ${cityExpr} as value,
        ${cityExpr} as label,
        COUNT(DISTINCT t.${col.storeCode}) as count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      AND ${col.cityCode === 'NULL' ? 'c.city' : `COALESCE(c.city, t.${col.cityCode})`} IS NOT NULL
      GROUP BY ${cityExpr}
      ORDER BY value
    `

    // Get distinct chains - Note: flat_customers_master has 'customer_type' column, not 'chain_name'
    const chainsQuery = `
      SELECT
        COALESCE(c.customer_type, 'Unknown') as value,
        COALESCE(c.customer_type, 'Unknown Chain') as label,
        COUNT(DISTINCT t.${col.storeCode}) as count
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      ${whereClause}
      AND c.customer_type IS NOT NULL
      GROUP BY c.customer_type
      ORDER BY c.customer_type
    `

    // Get distinct salesmen - Handle NULL columns properly
    let salesmenQuery = ''
    if (col.fieldUserCode === 'NULL') {
      // If fieldUserCode doesn't exist, return empty result
      salesmenQuery = `SELECT 'N/A' as value, 'No Salesman Column' as label, 0 as count WHERE false`
    } else {
      const userNameExpr = col.fieldUserName === 'NULL' 
        ? `COALESCE(t.${col.fieldUserCode}::text, 'Unknown User')` 
        : `COALESCE(t.${col.fieldUserName}, t.${col.fieldUserCode}::text, 'Unknown User')`
      salesmenQuery = `
      SELECT
          t.${col.fieldUserCode} as value,
          t.${col.fieldUserCode} || ' - ' || ${userNameExpr} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
      ${whereClause}
        AND t.${col.fieldUserCode} IS NOT NULL
        GROUP BY t.${col.fieldUserCode}
        ORDER BY t.${col.fieldUserCode}
      `
    }

    // Get distinct team leaders - Handle NULL columns properly
    let teamLeadersQuery = ''
    if (col.tlCode === 'NULL') {
      // If tlCode doesn't exist, return empty result
      teamLeadersQuery = `SELECT 'N/A' as value, 'No TL Column' as label, 0 as salesman_count WHERE false`
    } else {
      const tlNameExpr = col.tlName === 'NULL' 
        ? `COALESCE(t.${col.tlCode}::text, 'Unknown')` 
        : `COALESCE(t.${col.tlName}, t.${col.tlCode}::text, 'Unknown')`
      teamLeadersQuery = `
      SELECT
          t.${col.tlCode} as value,
          t.${col.tlCode} || ' - ' || ${tlNameExpr} as label,
          COUNT(DISTINCT ${col.fieldUserCode === 'NULL' ? 't.user_code' : `t.${col.fieldUserCode}`}) as salesman_count
        FROM ${transactionsTable} t
      ${whereClause}
        AND t.${col.tlCode} IS NOT NULL
        GROUP BY t.${col.tlCode}
        ORDER BY t.${col.tlCode}
      `
    }

    // Get distinct product categories - Handle NULL columns properly
    let categoriesQuery = ''
    if (col.productGroup === 'NULL') {
      // If productGroup doesn't exist, return a single "Others" category
      categoriesQuery = `
        SELECT
          'Others' as value,
          'Others' as label,
          COUNT(DISTINCT t.product_code) as product_count,
          COUNT(DISTINCT t.${col.storeCode}) as customer_count
        FROM ${transactionsTable} t
        ${whereClause}
        GROUP BY 1
        ORDER BY product_count DESC
      `
    } else {
      const productGroupExpr = `COALESCE(t.${col.productGroup}, 'Others')`
      categoriesQuery = `
      SELECT
          ${productGroupExpr} as value,
          ${productGroupExpr} as label,
          COUNT(DISTINCT t.product_code) as product_count,
          COUNT(DISTINCT t.${col.storeCode}) as customer_count
        FROM ${transactionsTable} t
      ${whereClause}
        GROUP BY ${productGroupExpr}
      ORDER BY product_count DESC
    `
    }

    // Check if we should cache based on date range
    const shouldCache = shouldCacheFilters(range, startDateParam, endDateParam)
    
    // Create cache key
    const cacheKey = generateFilterCacheKey('customers-v3', {
      range,
      startDate: startDateParam || null,
      endDate: endDateParam || null,
      table: transactionsTable,
      startStr,
      endStr
    })

    // Internal function to fetch filters (extracted for caching)
    const fetchFiltersInternal = async () => {
      const { query } = await import('@/lib/database')
      
      // Rebuild queries (they depend on startStr, endStr, col, transactionsTable, whereClause)
      const customerNameExpr = col.storeName === 'NULL' ? 'COALESCE(c.customer_name, \'Unknown\')' : `COALESCE(t.${col.storeName}, c.customer_name, 'Unknown')`
      const customersQuery = `
        SELECT
          t.${col.storeCode} as value,
          t.${col.storeCode} || ' - ' || ${customerNameExpr} as label,
          COUNT(DISTINCT t.${col.trxCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        AND t.${col.storeCode} IS NOT NULL
        GROUP BY t.${col.storeCode}, ${customerNameExpr}
        ORDER BY count DESC
        LIMIT 100
      `

      const regionExpr = col.regionCode === 'NULL' ? 'c.state' : `COALESCE(c.state, t.${col.regionCode}, 'Unknown')`
      const regionsQuery = `
        SELECT
          ${regionExpr} as value,
          ${regionExpr} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        AND ${col.regionCode === 'NULL' ? 'c.state' : `COALESCE(c.state, t.${col.regionCode})`} IS NOT NULL
        GROUP BY ${regionExpr}
        ORDER BY value
      `

      const cityExpr = col.cityCode === 'NULL' ? 'c.city' : `COALESCE(c.city, t.${col.cityCode}, 'Unknown')`
      const citiesQuery = `
        SELECT
          ${cityExpr} as value,
          ${cityExpr} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        AND ${col.cityCode === 'NULL' ? 'c.city' : `COALESCE(c.city, t.${col.cityCode})`} IS NOT NULL
        GROUP BY ${cityExpr}
        ORDER BY value
      `

      const chainsQuery = `
        SELECT
          COALESCE(c.customer_type, 'Unknown') as value,
          COALESCE(c.customer_type, 'Unknown Chain') as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
        ${whereClause}
        AND c.customer_type IS NOT NULL
        GROUP BY c.customer_type
        ORDER BY c.customer_type
      `

      let salesmenQuery = ''
      if (col.fieldUserCode === 'NULL') {
        salesmenQuery = `SELECT 'N/A' as value, 'No Salesman Column' as label, 0 as count WHERE false`
      } else {
        const userNameExpr = col.fieldUserName === 'NULL' 
          ? `COALESCE(t.${col.fieldUserCode}::text, 'Unknown User')` 
          : `COALESCE(t.${col.fieldUserName}, t.${col.fieldUserCode}::text, 'Unknown User')`
        salesmenQuery = `
          SELECT
            t.${col.fieldUserCode} as value,
            t.${col.fieldUserCode} || ' - ' || ${userNameExpr} as label,
            COUNT(DISTINCT t.${col.storeCode}) as count
          FROM ${transactionsTable} t
          ${whereClause}
          AND t.${col.fieldUserCode} IS NOT NULL
          GROUP BY t.${col.fieldUserCode}
          ORDER BY t.${col.fieldUserCode}
        `
      }

      let teamLeadersQuery = ''
      if (col.tlCode === 'NULL') {
        teamLeadersQuery = `SELECT 'N/A' as value, 'No TL Column' as label, 0 as salesman_count WHERE false`
      } else {
        const tlNameExpr = col.tlName === 'NULL' 
          ? `COALESCE(t.${col.tlCode}::text, 'Unknown')` 
          : `COALESCE(t.${col.tlName}, t.${col.tlCode}::text, 'Unknown')`
        teamLeadersQuery = `
          SELECT
            t.${col.tlCode} as value,
            t.${col.tlCode} || ' - ' || ${tlNameExpr} as label,
            COUNT(DISTINCT ${col.fieldUserCode === 'NULL' ? 't.user_code' : `t.${col.fieldUserCode}`}) as salesman_count
          FROM ${transactionsTable} t
          ${whereClause}
          AND t.${col.tlCode} IS NOT NULL
          GROUP BY t.${col.tlCode}
          ORDER BY t.${col.tlCode}
        `
      }

      let categoriesQuery = ''
      if (col.productGroup === 'NULL') {
        categoriesQuery = `
          SELECT
            'Others' as value,
            'Others' as label,
            COUNT(DISTINCT t.product_code) as product_count,
            COUNT(DISTINCT t.${col.storeCode}) as customer_count
          FROM ${transactionsTable} t
          ${whereClause}
          GROUP BY 1
          ORDER BY product_count DESC
        `
      } else {
        const productGroupExpr = `COALESCE(t.${col.productGroup}, 'Others')`
        categoriesQuery = `
          SELECT
            ${productGroupExpr} as value,
            ${productGroupExpr} as label,
            COUNT(DISTINCT t.product_code) as product_count,
            COUNT(DISTINCT t.${col.storeCode}) as customer_count
          FROM ${transactionsTable} t
          ${whereClause}
          GROUP BY ${productGroupExpr}
          ORDER BY product_count DESC
        `
      }

      const [custRes, regRes, cityRes, chainRes, salesRes, tlRes, catRes] = await Promise.all([
        query(customersQuery, []).catch(e => { console.error('Customers query error:', e); return { rows: [] } }),
        query(regionsQuery, []).catch(e => { console.error('Regions query error:', e); return { rows: [] } }),
        query(citiesQuery, []).catch(e => { console.error('Cities query error:', e); return { rows: [] } }),
        query(chainsQuery, []).catch(e => { console.error('Chains query error:', e); return { rows: [] } }),
        query(salesmenQuery, []).catch(e => { console.error('Salesmen query error:', e); return { rows: [] } }),
        query(teamLeadersQuery, []).catch(e => { console.error('Team leaders query error:', e); return { rows: [] } }),
        query(categoriesQuery, []).catch(e => { console.error('Categories query error:', e); return { rows: [] } })
      ])

      return {
        customers: custRes.rows || [],
        regions: regRes.rows || [],
        cities: cityRes.rows || [],
        chains: chainRes.rows || [],
        salesmen: salesRes.rows || [],
        teamLeaders: tlRes.rows || [],
        productCategories: catRes.rows || []
      }
    }

    // Fetch filters with or without caching
    let filterData
    if (shouldCache) {
      // Use cached version
      const cachedFetchFilters = unstable_cache(
        fetchFiltersInternal,
        [cacheKey],
        {
          revalidate: FILTERS_CACHE_DURATION,
          tags: ['customers-filters-v3', `customers-filters-${transactionsTable}`]
        }
      )
      filterData = await cachedFetchFilters()
    } else {
      // No caching - execute queries directly (using the queries already built above)
      let customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult
      
      try {
        [customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult] = await Promise.all([
          query(customersQuery, []).catch(e => { console.error('Customers query error:', e); return { rows: [] } }),
          query(regionsQuery, []).catch(e => { console.error('Regions query error:', e); return { rows: [] } }),
          query(citiesQuery, []).catch(e => { console.error('Cities query error:', e); return { rows: [] } }),
          query(chainsQuery, []).catch(e => { console.error('Chains query error:', e); return { rows: [] } }),
          query(salesmenQuery, []).catch(e => { console.error('Salesmen query error:', e); return { rows: [] } }),
          query(teamLeadersQuery, []).catch(e => { console.error('Team leaders query error:', e); return { rows: [] } }),
          query(categoriesQuery, []).catch(e => { console.error('Categories query error:', e); return { rows: [] } })
        ])
      } catch (error) {
        console.error('❌ Error executing filter queries:', error)
        customersResult = { rows: [] }
        regionsResult = { rows: [] }
        citiesResult = { rows: [] }
        chainsResult = { rows: [] }
        salesmenResult = { rows: [] }
        teamLeadersResult = { rows: [] }
        categoriesResult = { rows: [] }
      }
      
      filterData = {
        customers: customersResult.rows || [],
        regions: regionsResult.rows || [],
        cities: citiesResult.rows || [],
        chains: chainsResult.rows || [],
        salesmen: salesmenResult.rows || [],
        teamLeaders: teamLeadersResult.rows || [],
        productCategories: categoriesResult.rows || []
      }
    }

    return NextResponse.json({
      success: true,
      filters: filterData,
      dateRange: {
        start: startStr,
        end: endStr,
        label: range
      },
      cached: shouldCache,
      cacheInfo: shouldCache ? {
        duration: FILTERS_CACHE_DURATION
      } : {
        duration: 0,
        reason: range === 'today' ? 'today' : 'custom-range'
      }
    }, {
      headers: {
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(FILTERS_CACHE_DURATION)
          : 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    console.error('Customer filters V3 API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Internal function to fetch filters (will be cached)
async function fetchCustomersFiltersV2Internal(
  range: string,
  startStr: string,
  endStr: string,
  transactionsTable: string,
  col: any,
  routeCodeExpr: string
) {
  const { query } = await import('@/lib/database')
  
  const whereClause = `
    WHERE ${col.trxDateOnly} >= '${startStr}'
    AND ${col.trxDateOnly} <= '${endStr}'
  `

  const regionsQuery = `
    SELECT
      COALESCE(c.state, ${col.storeRegion}, 'Unknown') as value,
      COALESCE(c.state, ${col.storeRegion}, 'Unknown') || ' - ' || COALESCE(c.state, 'Unknown') as label,
      COUNT(DISTINCT ${col.storeCode}) as count
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    ${whereClause}
    AND (c.state IS NOT NULL OR ${col.storeRegion} IS NOT NULL)
    GROUP BY COALESCE(c.state, ${col.storeRegion}, 'Unknown')
    ORDER BY value
  `

  const citiesQuery = `
    SELECT
      COALESCE(c.city, ${col.storeCity}, 'Unknown') as value,
      COALESCE(c.city, ${col.storeCity}, 'Unknown') || ' - ' || COALESCE(c.city, 'Unknown City') as label,
      COUNT(DISTINCT ${col.storeCode}) as count
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    ${whereClause}
    AND (c.city IS NOT NULL OR ${col.storeCity} IS NOT NULL)
    GROUP BY COALESCE(c.city, ${col.storeCity}, 'Unknown')
    ORDER BY value
  `

  const chainsQuery = `
    SELECT
      COALESCE(c.customer_type, 'Unknown') as value,
      COALESCE(c.customer_type, 'Unknown Chain') as label,
      COUNT(DISTINCT ${col.storeCode}) as count
    FROM ${transactionsTable} t
    LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
    ${whereClause}
    AND c.customer_type IS NOT NULL
    GROUP BY c.customer_type
    ORDER BY c.customer_type
  `

  const salesmenQuery = `
    SELECT
      ${col.fieldUserCode} as value,
      ${col.fieldUserCode} || ' - ' || COALESCE(${col.fieldUserName}, 'Unknown User') as label,
      COUNT(DISTINCT ${col.storeCode}) as count
    FROM ${transactionsTable} t
    ${whereClause}
    AND ${col.fieldUserCode} IS NOT NULL
    GROUP BY ${col.fieldUserCode}, ${col.fieldUserName}
    ORDER BY ${col.fieldUserCode}
  `

  const routesQuery = routeCodeExpr === 'NULL'
    ? `SELECT 'N/A' as value, 'No Route Column' as label, 0 as count WHERE false`
    : `
      SELECT
        ${routeCodeExpr} as value,
        ${routeCodeExpr} as label,
        COUNT(DISTINCT ${col.storeCode}) as count
      FROM ${transactionsTable} t
      ${whereClause}
      AND ${routeCodeExpr} IS NOT NULL
      GROUP BY ${routeCodeExpr}
      ORDER BY ${routeCodeExpr}
    `

  const [regionsResult, citiesResult, chainsResult, salesmenResult, routesResult] = await Promise.all([
    query(regionsQuery, []),
    query(citiesQuery, []),
    query(chainsQuery, []),
    query(salesmenQuery, []),
    query(routesQuery, [])
  ])

  return {
    regions: regionsResult.rows || [],
    cities: citiesResult.rows || [],
    chains: chainsResult.rows || [],
    salesmen: salesmenResult.rows || [],
    routes: routesResult.rows || []
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    
    // Get date range
    const current = new Date()
    let startDate: Date = new Date(current)
    let endDate: Date = new Date(current)

    switch(range) {
      case 'lastMonth':
        startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        endDate = new Date(current.getFullYear(), current.getMonth(), 0)
        break
      case 'thisMonth':
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        endDate = new Date(current)
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
        startDate = new Date(current)
        startDate.setDate(startDate.getDate() - 29)
        endDate = new Date(current)
    }

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]
    
    await db.initialize()
    
    // Get table info and column expressions
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getTransactionColumnExpressions(tableInfo.columns)
    
    // Check if route_code column exists
    const hasRouteCode = tableInfo.columns.has('route_code') || tableInfo.columns.has('user_route_code')
    const routeCodeExpr = hasRouteCode 
      ? (tableInfo.columns.has('route_code') ? 't.route_code' : 't.user_route_code')
      : 'NULL'

    // Check if we should cache (exclude "today" range)
    const shouldCache = shouldCacheFilters(range, null, null)
    
    const cacheKey = generateFilterCacheKey('customers-v2', {
      range,
      startStr,
      endStr,
      table: transactionsTable
    })

    let filterData
    if (shouldCache) {
      // Fetch with caching
      const cachedFetchFilters = unstable_cache(
        async () => fetchCustomersFiltersV2Internal(range, startStr, endStr, transactionsTable, col, routeCodeExpr),
        [cacheKey],
        {
          revalidate: FILTERS_CACHE_DURATION,
          tags: ['customers-filters-v2', `customers-filters-${transactionsTable}`]
        }
      )
      filterData = await cachedFetchFilters()
    } else {
      // No caching - execute directly
      filterData = await fetchCustomersFiltersV2Internal(range, startStr, endStr, transactionsTable, col, routeCodeExpr)
    }

    return NextResponse.json({
      success: true,
      filters: filterData,
      dateRange: {
        start: startStr,
        end: endStr,
        label: range
      },
      timestamp: new Date().toISOString(),
      cached: shouldCache,
      cacheInfo: shouldCache ? { duration: FILTERS_CACHE_DURATION } : { duration: 0, reason: 'today' }
    }, {
      headers: {
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(FILTERS_CACHE_DURATION)
          : 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('Customer filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

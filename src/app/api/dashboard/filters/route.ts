import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { resolveTransactionsTable } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Internal function to fetch dashboard filters (will be cached)
async function fetchDashboardFiltersInternal(transactionsTable: string, columns: Set<string>) {
  const { query } = await import('@/lib/database')
    
    // Initialize arrays for filter options
    let regions: any[] = []
    let cities: any[] = []
    let salesPersons: any[] = []
    let customerTypes: any[] = []
    let productCategories: any[] = []
    let stores: any[] = []

  // Fetch all filters in parallel
  await Promise.all([
    // Fetch regions (states) from customers master
    query(`
        SELECT DISTINCT 
          state as value, 
          state as label,
          COUNT(DISTINCT customer_code) as available
        FROM flat_customers_master
        WHERE state IS NOT NULL AND state != ''
        GROUP BY state
        ORDER BY state
    `).then(result => { regions = result.rows || [] }).catch(err => console.error('Error fetching regions:', err)),

    // Fetch cities from customers master
    query(`
        SELECT DISTINCT 
          city as value, 
          city as label,
          COUNT(DISTINCT customer_code) as available
        FROM flat_customers_master
        WHERE city IS NOT NULL AND city != ''
        GROUP BY city
        ORDER BY city
    `).then(result => { cities = result.rows || [] }).catch(err => console.error('Error fetching cities:', err)),

    // Fetch sales persons from customers master
    query(`
        SELECT DISTINCT 
          sales_person_code as value,
          sales_person_name as label,
          COUNT(DISTINCT customer_code) as available
        FROM flat_customers_master
        WHERE sales_person_code IS NOT NULL 
          AND sales_person_code != ''
          AND sales_person_name IS NOT NULL
        GROUP BY sales_person_code, sales_person_name
        ORDER BY sales_person_name
    `).then(result => { salesPersons = result.rows || [] }).catch(err => console.error('Error fetching sales persons:', err)),

    // Fetch customer types
    query(`
        SELECT DISTINCT 
          customer_type as value,
          customer_type as label,
          COUNT(DISTINCT customer_code) as available
        FROM flat_customers_master
        WHERE customer_type IS NOT NULL AND customer_type != ''
        GROUP BY customer_type
        ORDER BY customer_type
    `).then(result => { customerTypes = result.rows || [] }).catch(err => console.error('Error fetching customer types:', err)),

    // Fetch product categories from sales transactions
    columns.has('product_group_level1') 
      ? query(`
        SELECT DISTINCT 
            COALESCE(product_group_level1, 'Unknown') as value,
            COALESCE(product_group_level1, 'Unknown') as label,
          COUNT(DISTINCT product_code) as available
          FROM ${transactionsTable}
        WHERE product_group_level1 IS NOT NULL AND product_group_level1 != ''
        GROUP BY product_group_level1
        ORDER BY product_group_level1
        `).then(result => { productCategories = result.rows || [] }).catch(err => console.error('Error fetching product categories:', err))
      : Promise.resolve(),

    // Fetch top stores/customers
    query(`
        SELECT DISTINCT 
          customer_code as value,
          customer_name as label,
          city,
          state
        FROM flat_customers_master
        WHERE customer_code IS NOT NULL 
          AND customer_name IS NOT NULL
        ORDER BY customer_name
        LIMIT 100
    `).then(result => { stores = result.rows || [] }).catch(err => console.error('Error fetching stores:', err))
  ])

  return {
        regions,
        cities,
    fieldUserRoles: salesPersons,
    teamLeaders: salesPersons,
    fieldUsers: salesPersons,
    chains: customerTypes,
        stores,
        summary: {
          totalRegions: regions.length,
          totalRoutes: 0,
          totalUsers: 0,
          totalTeamLeaders: 0,
          totalChains: 0,
          totalStores: 0,
          dateRange: {
            min: '',
            max: '',
            daysWithData: 0
          }
        }
  }
}

// Enhanced dashboard filters API that fetches comprehensive filter options
export async function GET(request: NextRequest) {
  try {
    console.log('Dashboard filters API called - fetching comprehensive filter data')
    const { name: transactionsTable, columns } = await resolveTransactionsTable()
    
    // Create cache key
    const cacheKey = generateFilterCacheKey('dashboard', { table: transactionsTable })
    
    // Fetch filters with caching
    const cachedFetchFilters = unstable_cache(
      async () => fetchDashboardFiltersInternal(transactionsTable, columns),
      [cacheKey],
      {
        revalidate: FILTERS_CACHE_DURATION,
        tags: ['dashboard-filters', `dashboard-filters-${transactionsTable}`]
      }
    )

    const filterData = await cachedFetchFilters()
    
    // Return comprehensive filter options
    return NextResponse.json({
      success: true,
      data: filterData,
      hierarchy: {
        loginUserCode: null,
        isTeamLeader: false,
        allowedUserCount: 0,
        allowedTeamLeaderCount: 0,
        allowedFieldUserCount: 0
      },
      timestamp: new Date().toISOString(),
      cached: true,
      cacheInfo: {
        duration: FILTERS_CACHE_DURATION
      }
    }, {
      headers: {
        'Cache-Control': getCacheControlHeader(FILTERS_CACHE_DURATION)
      }
    })
  } catch (error) {
    console.error('Dashboard Filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
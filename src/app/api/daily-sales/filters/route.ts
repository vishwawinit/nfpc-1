import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Table name constant
const SALES_TABLE = 'flat_daily_sales_report'

// Internal function to fetch daily sales filters (will be cached)
async function fetchDailySalesFiltersInternal(params: {
  startDate: string | null
  endDate: string | null
  loginUserCode: string | null
  selectedRegion: string | null
  selectedCity: string | null
  selectedFieldUserRole: string | null
  selectedTeamLeader: string | null
  selectedUser: string | null
  selectedChain: string | null
  selectedStore: string | null
}) {
  const { query } = await import('@/lib/database')
  
  const {
    startDate,
    endDate,
    selectedRegion,
    selectedCity,
    selectedFieldUserRole,
    selectedTeamLeader,
    selectedUser,
    selectedChain,
    selectedStore
  } = params
    
    // Authentication removed - no user restrictions
    let allowedUserCodes: string[] = []
    let allowedTeamLeaders: string[] = []
    let allowedFieldUsers: string[] = []

    // Build dynamic where clause for availability counts
    const buildAvailabilityWhere = (excludeField?: string) => {
      const conditions = []
      conditions.push(`UPPER(COALESCE(trx_usercode, '')) NOT LIKE '%DEMO%'`)
      conditions.push(`UPPER(COALESCE(customer_regioncode, '')) NOT LIKE '%DEMO%'`)
      conditions.push(`trx_trxtype = 1`)

      if (startDate && endDate) {
        conditions.push(`trx_trxdate >= '${startDate}'::timestamp`)
        conditions.push(`trx_trxdate < ('${endDate}'::timestamp + INTERVAL '1 day')`)
      }

      // Authentication removed - no user code restrictions

      if (selectedRegion && excludeField !== 'region') {
        conditions.push(`customer_regioncode = '${selectedRegion}'`)
      }
      if (selectedCity && excludeField !== 'city') {
        conditions.push(`(customer_citycode = '${selectedCity}' OR city_description = '${selectedCity}')`)
      }
      if (selectedFieldUserRole && excludeField !== 'fieldUserRole') {
        conditions.push(`COALESCE(user_usertype, 'Field User') = '${selectedFieldUserRole}'`)
      }
      if (selectedTeamLeader && excludeField !== 'teamLeader') {
        conditions.push(`route_salesmancode = '${selectedTeamLeader}'`)
      }
      if (selectedUser && excludeField !== 'user') {
        conditions.push(`trx_usercode = '${selectedUser}'`)
      }
      if (selectedChain && excludeField !== 'chain') {
        conditions.push(`customer_channel_description = '${selectedChain}'`)
      }
      if (selectedStore && excludeField !== 'store') {
        conditions.push(`customer_code = '${selectedStore}'`)
      }

      return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    }

    // Fetch all filter options in parallel
    const [
      regionsResult,
      citiesResult,
      fieldUserRolesResult,
      teamLeadersResult,
      fieldUsersResult,
      chainsResult,
      storesResult,
      dateRangeResult
    ] = await Promise.all([
      // Get ALL regions with counts based on other filters
      query(`
        SELECT
          customer_regioncode as "value",
          COALESCE(MAX(region_description), customer_regioncode) as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('region')}
        GROUP BY customer_regioncode
        HAVING customer_regioncode IS NOT NULL
        AND UPPER(customer_regioncode) NOT LIKE '%DEMO%'
        ORDER BY customer_regioncode
      `),

      // Get cities
      query(`
        SELECT
          COALESCE(
            city_description,
            CASE
              WHEN customer_citycode LIKE '%_%' THEN SUBSTRING(customer_citycode FROM POSITION('_' IN customer_citycode) + 1)
              ELSE customer_citycode
            END
          ) as "value",
          COALESCE(
            city_description,
            CASE
              WHEN customer_citycode LIKE '%_%' THEN SUBSTRING(customer_citycode FROM POSITION('_' IN customer_citycode) + 1)
              ELSE customer_citycode
            END
          ) as "label",
          COUNT(*) as "transactionCount",
          COUNT(DISTINCT customer_code) as "storeCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('city')}
        GROUP BY city_description, customer_citycode
        HAVING COALESCE(city_description, customer_citycode) IS NOT NULL
        AND COALESCE(city_description, customer_citycode) != ''
        AND UPPER(COALESCE(city_description, customer_citycode)) NOT LIKE '%DEMO%'
        ORDER BY "label"
      `),

      // Get field user roles (excluding Team Leader)
      query(`
        SELECT
          COALESCE(user_usertype, 'Field User') as "value",
          CASE COALESCE(user_usertype, 'Field User')
            WHEN 'ATL' THEN 'Asst. Team Leader'
            ELSE COALESCE(user_usertype, 'Field User')
          END as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('fieldUserRole')}
        AND COALESCE(user_usertype, 'Field User') != 'Team Leader'
        GROUP BY user_usertype
        ORDER BY
          CASE COALESCE(user_usertype, 'Field User')
            WHEN 'ATL' THEN 1
            WHEN 'Promoter' THEN 2
            WHEN 'Merchandiser' THEN 3
            WHEN 'Field User' THEN 4
            ELSE 5
          END
      `),

      // Get Team Leaders
      query(`
        SELECT
          route_salesmancode as "value",
          route_salesmancode as "label",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('teamLeader')}
        AND route_salesmancode IS NOT NULL
        GROUP BY route_salesmancode
        HAVING UPPER(route_salesmancode) NOT LIKE '%DEMO%'
        ORDER BY route_salesmancode
      `),

      // Get field users
      query(`
        SELECT
          trx_usercode as "value",
          COALESCE(MAX(user_description), trx_usercode) || ' (' || trx_usercode || ')' as "label",
          COALESCE(MAX(user_usertype), 'Field User') as "role",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('user')}
        AND COALESCE(user_usertype, 'Field User') != 'Team Leader'
        GROUP BY trx_usercode
        HAVING trx_usercode IS NOT NULL
        AND UPPER(trx_usercode) NOT LIKE '%DEMO%'
        ORDER BY MAX(user_description)
      `),

      // Get chains/channels
      query(`
        SELECT
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as "value",
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as "label",
          COUNT(*) as "transactionCount",
          COUNT(DISTINCT customer_code) as "storeCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('chain')}
        GROUP BY customer_channel_description, customer_channelcode
        HAVING customer_channel_description IS NOT NULL OR customer_channelcode IS NOT NULL
        ORDER BY "value"
      `),

      // Get stores/customers
      query(`
        SELECT
          customer_code as "value",
          COALESCE(MAX(customer_description), customer_code) || ' (' || customer_code || ')' as "label",
          COALESCE(MAX(customer_channel_description), MAX(customer_channelcode), 'Unknown') as "chainName",
          COUNT(*) as "transactionCount"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere('store')}
        GROUP BY customer_code
        HAVING customer_code IS NOT NULL
        AND MAX(customer_description) IS NOT NULL
        ORDER BY MAX(customer_description)
      `),

      // Get date range
      query(`
        SELECT
          MIN(trx_trxdate::date) as "minDate",
          MAX(trx_trxdate::date) as "maxDate",
          COUNT(DISTINCT trx_trxdate::date) as "daysWithData"
        FROM ${SALES_TABLE}
        ${buildAvailabilityWhere()}
      `)
    ])

    // Format results - ONLY SHOW OPTIONS WITH TRANSACTIONS (or currently selected)
    const regions = regionsResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        available: parseInt(row.transactionCount) || 0
      }))
      .filter(r => r.available > 0 || r.value === selectedRegion)

    const cities = citiesResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        available: parseInt(row.transactionCount) || 0,
        storeCount: parseInt(row.storeCount) || 0
      }))
      .filter(c => c.available > 0 || c.value === selectedCity)

    const fieldUserRoles = fieldUserRolesResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        available: parseInt(row.transactionCount) || 0
      }))
      .filter(r => r.available > 0 || r.value === selectedFieldUserRole)

    const teamLeaders = teamLeadersResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        available: parseInt(row.transactionCount) || 0
      }))
      .filter(tl => {
        // Show all team leaders with transactions
        return tl.available > 0 || tl.value === selectedTeamLeader
      })

    const fieldUsers = fieldUsersResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        role: row.role,
        available: parseInt(row.transactionCount) || 0
      }))
      .filter(u => {
        // Show all field users with transactions
        return u.available > 0 || u.value === selectedUser
      })

    const chains = chainsResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        available: parseInt(row.transactionCount) || 0,
        storeCount: parseInt(row.storeCount) || 0
      }))
      .filter(c => c.available > 0 || c.value === selectedChain)

    const stores = storesResult.rows
      .map(row => ({
        value: row.value,
        label: row.label,
        chainName: row.chainName,
        available: parseInt(row.transactionCount) || 0
      }))
      .filter(s => s.available > 0 || s.value === selectedStore)

    // Get date range info
    const dateRange = dateRangeResult.rows[0] || {}

    // Calculate summary statistics
    const summary = {
      totalRegions: regions.length,
      totalUsers: fieldUsers.length,
      totalTeamLeaders: teamLeaders.length,
      totalChains: chains.length,
      totalStores: stores.length,
      dateRange: {
        min: dateRange.minDate,
        max: dateRange.maxDate,
        daysWithData: dateRange.daysWithData || 0
      }
    }

    return {
      regions,
      cities,
      fieldUserRoles,
      teamLeaders,
      fieldUsers,
      chains,
      stores,
      summary
    }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Get selected filter values
    const selectedRegion = searchParams.get('regionCode')
    const selectedCity = searchParams.get('cityCode')
    const selectedFieldUserRole = searchParams.get('fieldUserRole')
    const selectedTeamLeader = searchParams.get('teamLeaderCode')
    const selectedUser = searchParams.get('userCode')
    const selectedChain = searchParams.get('chainName')
    const selectedStore = searchParams.get('storeCode')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    // Authentication removed - loginUserCode no longer used
    const loginUserCode = null

    // Check if we should cache (exclude custom date ranges)
    const shouldCache = shouldCacheFilters(null, startDate, endDate)
    
    const filterParams = {
      startDate,
      endDate,
      loginUserCode,
      selectedRegion,
      selectedCity,
      selectedFieldUserRole,
      selectedTeamLeader,
      selectedUser,
      selectedChain,
      selectedStore
    }

    let filterData
    if (shouldCache) {
      // Create cache key
      const cacheKey = generateFilterCacheKey('daily-sales', filterParams)
      
      // Fetch with caching
      const cachedFetchFilters = unstable_cache(
        async () => fetchDailySalesFiltersInternal(filterParams),
        [cacheKey],
        {
          revalidate: FILTERS_CACHE_DURATION,
          tags: ['daily-sales-filters']
        }
      )
      filterData = await cachedFetchFilters()
    } else {
      // No caching - execute directly
      filterData = await fetchDailySalesFiltersInternal(filterParams)
    }

    return NextResponse.json({
      ...filterData,
      cached: shouldCache,
      cacheInfo: shouldCache ? { duration: FILTERS_CACHE_DURATION } : { duration: 0, reason: 'custom-range' }
    }, {
      headers: {
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(FILTERS_CACHE_DURATION)
          : 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('Daily Sales Filters API error:', error)
    return NextResponse.json({
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

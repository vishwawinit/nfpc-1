import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Use the flat_daily_sales_report table
const SALES_TABLE = 'flat_daily_sales_report'

// Internal function to fetch filter options (will be cached)
async function fetchLMTDFiltersInternal(params: {
  startDate: string | null
  endDate: string | null
  currentDate: string
  selectedTeamLeader: string | null
  selectedUser: string | null
  selectedChain: string | null
  selectedStore: string | null
  selectedCategory: string | null
}) {
  // Use the query function from the module scope
  const { query: dbQuery } = await import('@/lib/database')

  // Date column expression for flat_daily_sales_report
  const dateColumnExpr = 'DATE(trx_trxdate)'
  
  const {
    startDate,
    endDate,
    currentDate,
    selectedTeamLeader,
    selectedUser,
    selectedChain,
    selectedStore,
    selectedCategory
  } = params

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

  // Authentication removed - no hierarchy filtering

  // Build where clause for cascading filters with parameterized queries
  const buildWhereClause = (excludeField?: string): { clause: string, params: any[] } => {
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1
    
    // Use detected date column expression (accessible from outer scope)
    conditions.push(`${dateColumnExpr} >= $${paramIndex}::date`)
    params.push(lmtdStart)
    paramIndex++
    
    conditions.push(`${dateColumnExpr} <= $${paramIndex}::date`)
    params.push(mtdEnd)
    paramIndex++
    
    // Filter out NULL and zero trx_totalamount values
    conditions.push(`trx_totalamount > 0`)

    // Always filter for sales transactions
    conditions.push(`trx_trxtype = 1`)

    if (selectedTeamLeader && excludeField !== 'teamLeader') {
      conditions.push(`route_salesmancode = $${paramIndex}`)
      params.push(selectedTeamLeader)
      paramIndex++
    }
    if (selectedUser && excludeField !== 'user') {
      conditions.push(`trx_usercode = $${paramIndex}`)
      params.push(selectedUser)
      paramIndex++
    }
    if (selectedChain && excludeField !== 'chain') {
      conditions.push(`customer_channel_description = $${paramIndex}`)
      params.push(selectedChain)
      paramIndex++
    }
    if (selectedStore && excludeField !== 'store') {
      conditions.push(`customer_code = $${paramIndex}`)
      params.push(selectedStore)
      paramIndex++
    }
    if (selectedCategory && excludeField !== 'category') {
      conditions.push(`item_grouplevel1 = $${paramIndex}`)
      params.push(selectedCategory)
      paramIndex++
    }
    
    // Always ensure we have at least date conditions
    // Date conditions are always added above, so this should never be empty
    if (conditions.length === 0) {
      // Fallback: if somehow no conditions, add a safe default
      conditions.push('1=1')
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`
    
    return {
      clause: whereClause,
      params
    }
  }

  // Fetch all filter options in parallel with error handling
  // Each query returns empty result on error instead of throwing
  const [
    teamLeadersResult,
    usersResult,
    chainsResult,
    storesResult,
    categoriesResult,
    productsResult
  ] = await Promise.all([
    (async () => {
      const whereClause = buildWhereClause('teamLeader')
      
      const query = `
        SELECT DISTINCT
          route_salesmancode as "value",
          route_salesmancode as "label",
          COUNT(*) as "count"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        AND route_salesmancode IS NOT NULL
        AND UPPER(COALESCE(route_salesmancode, '')) NOT LIKE '%DEMO%'
        GROUP BY route_salesmancode
        ORDER BY route_salesmancode
        LIMIT 100
      `
      const params = [...whereClause.params]
      try {
        return await dbQuery(query, params)
      } catch (error) {
        console.error('Error fetching team leaders:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', params)
        // Return empty result instead of throwing to allow other filters to load
        return { rows: [] }
      }
    })(),
    
    (async () => {
      const whereClause = buildWhereClause('user')
      
      const query = `
        SELECT DISTINCT
          trx_usercode as "value",
          trx_usercode || ' (' || trx_usercode || ')' as "label",
          'Field User' as "role",
          COUNT(*) as "count"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        AND trx_usercode IS NOT NULL
        AND UPPER(trx_usercode) NOT LIKE '%DEMO%'
        GROUP BY trx_usercode
        ORDER BY trx_usercode
        LIMIT 200
      `
      const params = [...whereClause.params]
      try {
        return await dbQuery(query, params)
      } catch (error) {
        console.error('Error fetching users:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', params)
        return { rows: [] }
      }
    })(),
    
    (async () => {
      const whereClause = buildWhereClause('chain')
      
      const query = `
        SELECT DISTINCT
          customer_channel_description as "value",
          customer_channel_description as "label",
          COUNT(*) as "count"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        AND customer_channel_description IS NOT NULL
        AND UPPER(customer_channel_description) NOT LIKE '%DEMO%'
        GROUP BY customer_channel_description
        ORDER BY customer_channel_description
        LIMIT 50
      `
      const params = [...whereClause.params]
      try {
        return await dbQuery(query, params)
      } catch (error) {
        console.error('Error fetching chains:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', params)
        return { rows: [] }
      }
    })(),
    
    (async () => {
      const whereClause = buildWhereClause('store')
      
      const query = `
        SELECT
          customer_code as "value",
          COALESCE(MAX(customer_description), customer_code) || ' (' || customer_code || ')' as "label",
          COUNT(*) as "count"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        AND customer_code IS NOT NULL
        AND UPPER(customer_code) NOT LIKE '%DEMO%'
        GROUP BY customer_code
        ORDER BY customer_code
        LIMIT 200
      `
      const params = [...whereClause.params]
      try {
        return await dbQuery(query, params)
      } catch (error) {
        console.error('Error fetching stores:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', params)
        return { rows: [] }
      }
    })(),
    
    (async () => {
      const whereClause = buildWhereClause('category')
      
      const query = `
        SELECT DISTINCT
          item_grouplevel1 as "value",
          item_grouplevel1 as "label",
          COUNT(*) as "count"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        AND item_grouplevel1 IS NOT NULL
        GROUP BY item_grouplevel1
        ORDER BY item_grouplevel1
        LIMIT 50
      `
      const params = [...whereClause.params]
      try {
        return await dbQuery(query, params)
      } catch (error) {
        console.error('Error fetching categories:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', params)
        return { rows: [] }
      }
    })(),
    
    (async () => {
      const whereClause = buildWhereClause()
      const query = `
        SELECT DISTINCT
          line_itemcode as "value",
          line_itemcode || ' - ' || COALESCE(MAX(line_itemdescription), 'Unknown Product') as "label",
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as "totalAmount"
        FROM ${SALES_TABLE}
        ${whereClause.clause}
        GROUP BY line_itemcode
        HAVING line_itemcode IS NOT NULL
        ORDER BY "totalAmount" DESC
        LIMIT 100
      `
      try {
        return await dbQuery(query, whereClause.params)
      } catch (error) {
        console.error('Error fetching products:', error)
        console.error('Query:', query.substring(0, 200))
        console.error('Params:', whereClause.params)
        return { rows: [] }
      }
    })()
  ])

  // Format results
  const teamLeaders = teamLeadersResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.count) || 0
    }))
    .filter(tl => tl.available > 0 || tl.value === selectedTeamLeader)

  const users = usersResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      role: row.role,
      available: parseInt(row.count) || 0
    }))
    .filter(u => u.available > 0 || u.value === selectedUser)

  const chains = chainsResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.count) || 0
    }))
    .filter(c => c.available > 0 || c.value === selectedChain)

  const stores = storesResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.count) || 0
    }))
    .filter(s => s.available > 0 || s.value === selectedStore)

  const categories = categoriesResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      available: parseInt(row.count) || 0
    }))
    .filter(c => c.available > 0 || c.value === selectedCategory)

  const products = productsResult.rows
    .map(row => ({
      value: row.value,
      label: row.label,
      available: parseFloat(row.totalAmount) || 0
    }))
    .slice(0, 100)

  return {
    filters: {
      teamLeaders,
      users,
      chains,
      stores,
      categories,
      products
    },
    hierarchy: {
      allowedUserCount: 0,
      allowedTeamLeaderCount: 0,
      allowedFieldUserCount: 0
    },
    periods: {
      mtd: { start: mtdStart, end: mtdEnd },
      lmtd: { start: lmtdStart, end: lmtdEnd }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    // Get date parameters
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const currentDate = endDate || new Date().toISOString().split('T')[0]
    
    // Calculate selectedEndDate early
    const selectedEndDate = endDate || currentDate
    
    // Authentication removed - no user validation needed

    // Get selected filter values for cascading
    const selectedTeamLeader = searchParams.get('teamLeaderCode')
    const selectedUser = searchParams.get('userCode')
    const selectedChain = searchParams.get('chainName')
    const selectedStore = searchParams.get('storeCode')
    const selectedCategory = searchParams.get('productCategory')

    // Build cache key
    const filterParams = {
      startDate: startDate || '',
      endDate: endDate || '',
      selectedTeamLeader: selectedTeamLeader || '',
      selectedUser: selectedUser || '',
      selectedChain: selectedChain || '',
      selectedStore: selectedStore || '',
      selectedCategory: selectedCategory || ''
    }
    const cacheKey = generateFilterCacheKey('lmtd-secondary-filters', filterParams)

    // Fetch with caching
    const cachedFetchFilters = unstable_cache(
      async () => fetchLMTDFiltersInternal({
        startDate,
        endDate,
        currentDate,
        selectedTeamLeader,
        selectedUser,
        selectedChain,
        selectedStore,
        selectedCategory
      }),
      [cacheKey],
      {
        revalidate: FILTERS_CACHE_DURATION,
        tags: ['lmtd-secondary-filters']
      }
    )

    const cachedData = await cachedFetchFilters()

    return NextResponse.json({
      success: true,
      ...cachedData,
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
    console.error('LMTD Filters API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : '',
      name: error instanceof Error ? error.name : typeof error
    })
    
    // Return more detailed error in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = process.env.NODE_ENV === 'development' 
      ? { stack: error instanceof Error ? error.stack : undefined }
      : {}
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: errorMessage,
      ...errorDetails
    }, { status: 500 })
  }
}

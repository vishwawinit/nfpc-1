import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

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
  
  // Use COALESCE to handle both trx_date_only and transaction_date columns
  // This matches the pattern used in the main LMTD route
  const dateColumnExpr = 'DATE(t.transaction_date)'
  
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
  
  // MTD: Always from 1st of current month (based on endDate) to the endDate
  const mtdStart = `${year}-${String(month).padStart(2, '0')}-01`
  const mtdEnd = selectedEndDate

  // LMTD: Always the entire previous month relative to the endDate
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const lastDayOfPrevMonth = new Date(year, month - 1, 0).getDate()
  
  const lmtdStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
  const lmtdEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`

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
    
    // Filter out NULL net_amount/order_total values for accurate KPI calculations
    // Use COALESCE to handle different column names
    conditions.push(`COALESCE(t.order_total, t.net_amount, t.line_amount, 0) > 0`)
    
    // Authentication removed - no user hierarchy filtering
    
    if (selectedTeamLeader && excludeField !== 'teamLeader') {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
      params.push(selectedTeamLeader)
      paramIndex++
    }
    if (selectedUser && excludeField !== 'user') {
      conditions.push(`t.user_code = $${paramIndex}`)
      params.push(selectedUser)
      paramIndex++
    }
    if (selectedChain && excludeField !== 'chain') {
      conditions.push(`c.customer_type = $${paramIndex}`)
      params.push(selectedChain)
      paramIndex++
    }
    if (selectedStore && excludeField !== 'store') {
      conditions.push(`t.customer_code = $${paramIndex}`)
      params.push(selectedStore)
      paramIndex++
    }
    if (selectedCategory && excludeField !== 'category') {
      // Use product_group_level1 from transactions table instead of products master
      // as flat_products_master may not have product_category column
      conditions.push(`t.product_code IN (
        SELECT DISTINCT product_code 
        FROM flat_transactions 
        WHERE product_group_level1 = $${paramIndex}
      )`)
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
        WITH all_team_leaders AS (
          SELECT DISTINCT
            c.sales_person_code as code,
            '' as name
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE c.sales_person_code IS NOT NULL
          AND UPPER(COALESCE(c.sales_person_code, '')) NOT LIKE '%DEMO%'
        ),
        filtered_transactions AS (
          SELECT
            c.sales_person_code as tl_code,
            COUNT(*) as transaction_count
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          ${whereClause.clause}
          AND c.sales_person_code IS NOT NULL
          GROUP BY c.sales_person_code
        )
        SELECT
          tl.code as "value",
          tl.code || ' (' || tl.code || ')' as "label",
          COALESCE(ft.transaction_count, 0) as "count"
        FROM all_team_leaders tl
        LEFT JOIN filtered_transactions ft ON tl.code = ft.tl_code
        ORDER BY tl.code
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
        SELECT
          fu.user_code as "value",
          fu.user_code || ' (' || fu.user_code || ')' as "label",
          'Field User' as "role",
          COALESCE(counts.transaction_count, 0) as "count"
        FROM (
          SELECT DISTINCT
            t.user_code
          FROM flat_transactions t
          WHERE t.user_code IS NOT NULL
          AND UPPER(t.user_code) NOT LIKE '%DEMO%'
        ) fu
        LEFT JOIN (
          SELECT
            t.user_code,
            COUNT(*) as transaction_count
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          ${whereClause.clause}
          GROUP BY t.user_code
        ) counts ON fu.user_code = counts.user_code
        ORDER BY fu.user_code
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
        SELECT
          c.customer_type as "value",
          c.customer_type as "label",
          COALESCE(counts.transaction_count, 0) as "count"
        FROM (
          SELECT DISTINCT COALESCE(c.customer_type, 'Unknown') as customer_type
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE c.customer_type IS NOT NULL
          AND UPPER(c.customer_type) NOT LIKE '%DEMO%'
        ) c
        LEFT JOIN (
          SELECT
            COALESCE(c.customer_type, 'Unknown') as customer_type,
            COUNT(*) as transaction_count
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          ${whereClause.clause}
          GROUP BY c.customer_type
        ) counts ON c.customer_type = counts.customer_type
        ORDER BY c.customer_type
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
          s.customer_code as "value",
          s.customer_name || ' (' || s.customer_code || ')' as "label",
          COALESCE(counts.transaction_count, 0) as "count"
        FROM (
          SELECT DISTINCT
            c.customer_code,
            c.customer_name
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          WHERE c.customer_code IS NOT NULL
          AND c.customer_name IS NOT NULL
          AND UPPER(c.customer_code) NOT LIKE '%DEMO%'
        ) s
        LEFT JOIN (
          SELECT
            t.customer_code,
            COUNT(*) as transaction_count
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          ${whereClause.clause}
          GROUP BY t.customer_code
        ) counts ON s.customer_code = counts.customer_code
        ORDER BY s.customer_name
        LIMIT 500
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
        SELECT
          p.product_category as "value",
          p.product_category as "label",
          COALESCE(counts.transaction_count, 0) as "count"
        FROM (
          SELECT DISTINCT COALESCE(t.product_group_level1, 'Unknown') as product_category
          FROM flat_transactions t
          WHERE t.product_group_level1 IS NOT NULL
        ) p
        LEFT JOIN (
          SELECT
            COALESCE(t.product_group_level1, 'Unknown') as product_category,
            COUNT(*) as transaction_count
          FROM flat_transactions t
          LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
          ${whereClause.clause}
          GROUP BY t.product_group_level1
        ) counts ON p.product_category = counts.product_category
        ORDER BY p.product_category
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
          t.product_code as "value",
          t.product_code || ' - ' || COALESCE(p.product_name, 'Unknown Product') as "label",
          SUM(COALESCE(t.order_total, t.net_amount, t.line_amount, 0)) as "totalAmount"
        FROM flat_transactions t
        LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
        LEFT JOIN flat_products_master p ON t.product_code = p.product_code
        ${whereClause.clause}
        GROUP BY t.product_code, p.product_name
        HAVING t.product_code IS NOT NULL
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

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'
import { validateApiUser } from '@/lib/apiUserValidation'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Disable automatic revalidation, use manual caching
export const revalidate = false

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/store-visits/filters', searchParams)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get loginUserCode for hierarchy-based filtering
    const loginUserCode = searchParams.get('loginUserCode')

    // Validate user access
    const validation = await validateApiUser(loginUserCode)
    if (!validation.isValid) {
      return validation.response!
    }

    // Fetch child users if loginUserCode is provided
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
    }

    console.log('🔄 Fetching fresh store visits filters from database...')
    
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Date filters
    if (searchParams.has('startDate') && searchParams.has('endDate')) {
      conditions.push(`visit_date >= $${paramIndex}`)
      params.push(searchParams.get('startDate'))
      paramIndex++
      conditions.push(`visit_date <= $${paramIndex}`)
      params.push(searchParams.get('endDate'))
      paramIndex++
    }

    // Area/Region filter
    if (searchParams.has('areaCode')) {
      conditions.push(`region_code = $${paramIndex}`)
      params.push(searchParams.get('areaCode'))
      paramIndex++
    }

    // Sub-Area filter
    if (searchParams.has('subAreaCode')) {
      conditions.push(`sub_area_code = $${paramIndex}`)
      params.push(searchParams.get('subAreaCode'))
      paramIndex++
    }

    // Route/TL Code filter
    if (searchParams.has('routeCode')) {
      conditions.push(`route_code = $${paramIndex}`)
      params.push(searchParams.get('routeCode'))
      paramIndex++
    }

    // Team Leader filter (for cascading)
    if (searchParams.has('teamLeaderCode')) {
      conditions.push(`route_code = $${paramIndex}`)
      params.push(searchParams.get('teamLeaderCode'))
      paramIndex++
    }

    // User filter
    if (searchParams.has('userCode')) {
      conditions.push(`user_code = $${paramIndex}`)
      params.push(searchParams.get('userCode'))
      paramIndex++
    }

    // Store filter
    if (searchParams.has('storeCode')) {
      conditions.push(`customer_code = $${paramIndex}`)
      params.push(searchParams.get('storeCode'))
      paramIndex++
    }

    // Chain filter
    if (searchParams.has('chainName')) {
      conditions.push(`channel_name = $${paramIndex}`)
      params.push(searchParams.get('chainName'))
      paramIndex++
    }

    // Hierarchy filter - apply if allowedUserCodes is provided
    if (allowedUserCodes.length > 0) {
      const placeholders = allowedUserCodes.map((_, index) => `$${paramIndex + index}`).join(', ')
      conditions.push(`user_code IN (${placeholders})`)
      params.push(...allowedUserCodes)
      paramIndex += allowedUserCodes.length
    }

    // Build dynamic WHERE clause for availability counts
    const buildAvailabilityWhere = (excludeField?: string) => {
      const availConditions = []
      let availParamIndex = 1
      const availParams: any[] = []

      // Date filters
      if (searchParams.has('startDate') && searchParams.has('endDate')) {
        availConditions.push(`visit_date >= $${availParamIndex}`)
        availParams.push(searchParams.get('startDate'))
        availParamIndex++
        availConditions.push(`visit_date <= $${availParamIndex}`)
        availParams.push(searchParams.get('endDate'))
        availParamIndex++
      }

      // Hierarchy filter
      if (allowedUserCodes.length > 0) {
        const placeholders = allowedUserCodes.map((_, index) => `$${availParamIndex + index}`).join(', ')
        availConditions.push(`user_code IN (${placeholders})`)
        availParams.push(...allowedUserCodes)
        availParamIndex += allowedUserCodes.length
      }

      // Add other filters (excluding the field being fetched)
      if (searchParams.has('areaCode') && excludeField !== 'area' && excludeField !== 'region') {
        availConditions.push(`region_code = $${availParamIndex}`)
        availParams.push(searchParams.get('areaCode'))
        availParamIndex++
      }
      if (searchParams.has('subAreaCode') && excludeField !== 'subArea' && excludeField !== 'city') {
        availConditions.push(`sub_area_code = $${availParamIndex}`)
        availParams.push(searchParams.get('subAreaCode'))
        availParamIndex++
      }
      if (searchParams.has('routeCode') && excludeField !== 'route') {
        availConditions.push(`route_code = $${availParamIndex}`)
        availParams.push(searchParams.get('routeCode'))
        availParamIndex++
      }
      if (searchParams.has('teamLeaderCode') && excludeField !== 'teamLeader') {
        availConditions.push(`route_code = $${availParamIndex}`)
        availParams.push(searchParams.get('teamLeaderCode'))
        availParamIndex++
      }
      if (searchParams.has('userCode') && excludeField !== 'user') {
        availConditions.push(`user_code = $${availParamIndex}`)
        availParams.push(searchParams.get('userCode'))
        availParamIndex++
      }
      if (searchParams.has('storeCode') && excludeField !== 'store') {
        availConditions.push(`customer_code = $${availParamIndex}`)
        availParams.push(searchParams.get('storeCode'))
        availParamIndex++
      }
      if (searchParams.has('chainName') && excludeField !== 'chain') {
        availConditions.push(`channel_name = $${availParamIndex}`)
        availParams.push(searchParams.get('chainName'))
        availParamIndex++
      }

      return {
        whereClause: availConditions.length > 0 ? `WHERE ${availConditions.join(' AND ')}` : '',
        params: availParams
      }
    }

    // Helper to build WHERE clause excluding certain fields for cascading
    const buildWhereExcluding = (...excludeFields: string[]) => {
      const filteredConditions = []
      const filteredParams = []
      let pIndex = 1

      // Date filters
      if (searchParams.has('startDate') && searchParams.has('endDate')) {
        filteredConditions.push(`visit_date >= $${pIndex}::date`)
        filteredParams.push(searchParams.get('startDate'))
        pIndex++
        filteredConditions.push(`visit_date <= $${pIndex}::date`)
        filteredParams.push(searchParams.get('endDate'))
        pIndex++
      }

      // Area filter
      if (searchParams.has('areaCode') && !excludeFields.includes('area')) {
        filteredConditions.push(`region_code = $${pIndex}`)
        filteredParams.push(searchParams.get('areaCode'))
        pIndex++
      }

      // Sub-Area filter
      if (searchParams.has('subAreaCode') && !excludeFields.includes('subArea')) {
        filteredConditions.push(`sub_area_code = $${pIndex}`)
        filteredParams.push(searchParams.get('subAreaCode'))
        pIndex++
      }

      // Route filter
      if (searchParams.has('routeCode') && !excludeFields.includes('route')) {
        filteredConditions.push(`route_code = $${pIndex}`)
        filteredParams.push(searchParams.get('routeCode'))
        pIndex++
      }

      // Team Leader filter
      if (searchParams.has('teamLeaderCode') && !excludeFields.includes('teamLeader')) {
        filteredConditions.push(`route_code = $${pIndex}`)
        filteredParams.push(searchParams.get('teamLeaderCode'))
        pIndex++
      }

      // User filter
      if (searchParams.has('userCode') && !excludeFields.includes('user')) {
        filteredConditions.push(`user_code = $${pIndex}`)
        filteredParams.push(searchParams.get('userCode'))
        pIndex++
      }

      // Store filter
      if (searchParams.has('storeCode') && !excludeFields.includes('store')) {
        filteredConditions.push(`customer_code = $${pIndex}`)
        filteredParams.push(searchParams.get('storeCode'))
        pIndex++
      }

      // Chain filter
      if (searchParams.has('chainName') && !excludeFields.includes('chain')) {
        filteredConditions.push(`channel_name = $${pIndex}`)
        filteredParams.push(searchParams.get('chainName'))
        pIndex++
      }

      // Hierarchy filter
      if (allowedUserCodes.length > 0) {
        const placeholders = allowedUserCodes.map((_, index) => `$${pIndex + index}`).join(', ')
        filteredConditions.push(`user_code IN (${placeholders})`)
        filteredParams.push(...allowedUserCodes)
        pIndex += allowedUserCodes.length
      }

      return {
        whereClause: filteredConditions.length > 0 ? `WHERE ${filteredConditions.join(' AND ')}` : '',
        params: filteredParams
      }
    }

    // Get distinct areas, subAreas, routes, teamLeaders, fieldUsers, stores, chains, and store classes with counts
    const areasWhere = buildWhereExcluding('area')
    const subAreasWhere = buildWhereExcluding('subArea', 'route', 'user', 'store')
    const routesWhere = buildWhereExcluding('route', 'user', 'store')
    const usersWhere = buildWhereExcluding('user', 'store')
    const storesWhere = buildWhereExcluding('store')
    const chainsWhere = buildWhereExcluding('chain', 'store')

    const [areasResult, subAreasResult, routesResult, fieldUsersResult, storesResult, chainsResult, storeClassesResult] = await Promise.all([
      // Areas (Regions) with counts
      query(`
        SELECT
          region_code as "value",
          region_code as "label",
          COUNT(*) as "visitCount"
        FROM flat_customer_visit
        ${areasWhere.whereClause}
        AND region_code IS NOT NULL
        GROUP BY region_code
        ORDER BY region_code
      `, areasWhere.params),

      // Sub-Areas with counts
      query(`
        SELECT
          sub_area_code as "value",
          sub_area_code as "label",
          COUNT(*) as "visitCount"
        FROM flat_customer_visit
        ${subAreasWhere.whereClause}
        AND sub_area_code IS NOT NULL
        GROUP BY sub_area_code
        ORDER BY sub_area_code
      `, subAreasWhere.params),

      // Routes (Route Codes) with counts
      query(`
        SELECT
          route_code as "value",
          MAX(sub_area_code) as "label",
          COUNT(*) as "visitCount"
        FROM flat_customer_visit
        ${routesWhere.whereClause}
        AND route_code IS NOT NULL
        GROUP BY route_code
        ORDER BY MAX(sub_area_code)
      `, routesWhere.params),

      // Field Users with counts
      query(`
        SELECT
          user_code as "value",
          MAX(user_name) as "label",
          COUNT(*) as "visitCount",
          COUNT(DISTINCT customer_code) as "storeCount"
        FROM flat_customer_visit
        ${usersWhere.whereClause}
        AND user_code IS NOT NULL
        GROUP BY user_code
        ORDER BY MAX(user_name)
      `, usersWhere.params),

      // Stores with counts
      query(`
        SELECT
          customer_code as "value",
          MAX(customer_name) as "label",
          COUNT(*) as "visitCount",
          COUNT(DISTINCT user_code) as "userCount"
        FROM flat_customer_visit
        ${storesWhere.whereClause}
        AND customer_code IS NOT NULL
        GROUP BY customer_code
        ORDER BY MAX(customer_name)
      `, storesWhere.params),

      // Chains with counts
      query(`
        SELECT
          channel_code as "value",
          MAX(channel_name) as "label",
          COUNT(*) as "visitCount",
          COUNT(DISTINCT customer_code) as "storeCount"
        FROM flat_customer_visit
        ${chainsWhere.whereClause}
        AND channel_code IS NOT NULL
        GROUP BY channel_code
        ORDER BY MAX(channel_name)
      `, chainsWhere.params),

      // Store Classes - return empty result
      query(`
        SELECT
          'N/A' as "value",
          'N/A' as "label",
          0 as "visitCount",
          0 as "storeCount"
        WHERE 1=0
      `, [])
    ])

    // Get hierarchy filter options from the users hierarchy API
    let teamLeaders: any[] = []
    let assistantLeaders: any[] = []

    try {
      // Fetch hierarchy data from the users hierarchy API using dynamic origin
      const hierarchyResponse = await fetch(`${request.nextUrl.origin}/api/users/hierarchy`)
      if (hierarchyResponse.ok) {
        const hierarchyData = await hierarchyResponse.json()

        teamLeaders = hierarchyData.data.teamLeaders.map((leader: any) => ({
          value: leader.code,
          label: leader.name,
          role: leader.role
        }))

        assistantLeaders = hierarchyData.data.assistantLeaders.map((leader: any) => ({
          value: leader.code,
          label: leader.name,
          role: leader.role
        }))
      }
    } catch (error) {
      console.warn('Failed to fetch hierarchy data:', error)
      // Continue without hierarchy data if there's an error
    }

    // Format results - filter out options with 0 visit count
    const areas = areasResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0
      }))
      .filter((a: any) => a.visitCount > 0 || a.value === searchParams.get('areaCode'))

    const subAreas = subAreasResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0
      }))
      .filter((sa: any) => sa.visitCount > 0 || sa.value === searchParams.get('subAreaCode'))

    const routes = routesResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0
      }))
      .filter((r: any) => r.visitCount > 0 || r.value === searchParams.get('routeCode'))

    const fieldUsers = fieldUsersResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0,
        storeCount: parseInt(row.storeCount) || 0
      }))
      .filter((u: any) => u.visitCount > 0 || u.value === searchParams.get('userCode'))

    const stores = storesResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0,
        userCount: parseInt(row.userCount) || 0
      }))
      .filter((s: any) => s.visitCount > 0 || s.value === searchParams.get('storeCode'))

    const chains = chainsResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0,
        storeCount: parseInt(row.storeCount) || 0
      }))
      .filter((c: any) => c.visitCount > 0 || c.value === searchParams.get('chainName'))

    const storeClasses = storeClassesResult.rows
      .map((row: any) => ({
        value: row.value,
        label: row.label,
        visitCount: parseInt(row.visitCount) || 0,
        storeCount: parseInt(row.storeCount) || 0
      }))
      .filter((sc: any) => sc.visitCount > 0 || sc.value === searchParams.get('storeClass'))

    // Calculate summary statistics
    const totalVisits = fieldUsers.reduce((sum, u) => sum + u.visitCount, 0)
    const totalUsers = fieldUsers.length
    const totalStores = stores.length
    const totalRoutes = routes.length

    // Get date range from the visits data (use all filters)
    const allFiltersWhere = buildWhereExcluding()
    let dateRangeQuery
    try {
      dateRangeQuery = await query(`
        SELECT
          MIN(visit_date::text) as min_date,
          MAX(visit_date::text) as max_date,
          COUNT(DISTINCT visit_date) as days_with_data
        FROM flat_customer_visit
        ${allFiltersWhere.whereClause}
      `, allFiltersWhere.params)
    } catch (err) {
      console.warn('Failed to fetch date range:', err)
      dateRangeQuery = { rows: [{ min_date: '', max_date: '', days_with_data: 0 }] }
    }

    const responseJson = {
      success: true,
      data: {
        areas,
        subAreas,
        routes,
        teamLeaders: teamLeaders.map(tl => ({
          value: tl.value,
          label: tl.label,
          role: tl.role
        })),
        fieldUsers,
        stores,
        chains,
        storeClasses,
        summary: {
          totalVisits,
          totalUsers,
          totalStores,
          totalRoutes,
          dateRange: {
            min: dateRangeQuery.rows[0]?.min_date || '',
            max: dateRangeQuery.rows[0]?.max_date || '',
            daysWithData: parseInt(dateRangeQuery.rows[0]?.days_with_data) || 0
          }
        }
      },
      timestamp: new Date().toISOString(),
      cached: false
    }

    // Store in cache
    apiCache.set('/api/store-visits/filters', searchParams, responseJson)

    return NextResponse.json(responseJson, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })
  } catch (error) {
    console.error('Store Visits Filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

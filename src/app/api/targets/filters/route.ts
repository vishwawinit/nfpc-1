import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Internal function to fetch filters (will be cached)
async function fetchTargetsFiltersInternal(
  targetsTable: string,
  year: string | null,
  month: string | null,
  userCode: string | null
) {
  const { query } = await import('@/lib/database')
    
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1
    
  if (year) {
    conditions.push(`t.year = $${paramIndex}`)
    params.push(parseInt(year))
      paramIndex++
    }

  if (month) {
    conditions.push(`t.month = $${paramIndex}`)
    params.push(parseInt(month))
      paramIndex++
    }

  if (userCode) {
    conditions.push(`t.salesmancode = $${paramIndex}`)
    params.push(userCode)
      paramIndex++
    }

  const filterConditions = [...conditions]
  const filterParams = [...params]
  const filterWhereClause = filterConditions.length > 0 
    ? `WHERE ${filterConditions.join(' AND ')}` 
    : ''

    const [
      usersResult, 
      teamLeadersResult,
      customersResult, 
      yearsResult, 
      monthsResult, 
      chainsResult, 
      brandsResult, 
      categoriesResult,
      targetTypesResult,
      targetStatusResult,
      targetLevelResult,
      salesOrgResult,
      userRolesResult
    ] = await Promise.all([
    query(`
      SELECT DISTINCT 
        t.salesmancode::text as "value", 
        COALESCE(u.username, t.salesmancode, 'Unknown') || ' (' || t.salesmancode || ')' as "label"
      FROM ${targetsTable} t
      LEFT JOIN tbluser u ON t.salesmancode = u.empcode
      ${filterWhereClause ? `${filterWhereClause} AND` : 'WHERE'} t.salesmancode IS NOT NULL AND t.isactive = true
      ORDER BY COALESCE(u.username, t.salesmancode)
    `, filterParams).catch((e) => {
      console.error('Error fetching users filter:', e)
      return { rows: [] }
    }),
    Promise.resolve({ rows: [] }),
    Promise.resolve({ rows: [] }),
    query(`SELECT DISTINCT t.year::text as "value", t.year::text as "label" FROM ${targetsTable} t WHERE t.isactive = true ORDER BY t.year DESC`, []).catch((e) => {
      console.error('Error fetching years filter:', e)
      return { rows: [] }
    }),
    query(`SELECT DISTINCT t.month::text as "value", t.month::text as "label" FROM ${targetsTable} t WHERE t.isactive = true ORDER BY t.month`, []).catch((e) => {
      console.error('Error fetching months filter:', e)
      return { rows: [] }
    }),
    Promise.resolve({ rows: [] }),
    Promise.resolve({ rows: [] }),
    Promise.resolve({ rows: [] }),
    query(`
      SELECT DISTINCT 
        t.targettype::text as "value", 
        t.targettype::text as "label" 
      FROM ${targetsTable} t 
      ${filterWhereClause ? `${filterWhereClause} AND` : 'WHERE'} t.targettype IS NOT NULL AND t.isactive = true
      ORDER BY t.targettype
    `, filterParams).catch((e) => {
      console.error('Error fetching target types filter:', e)
      return { rows: [] }
    }),
    query(`
      SELECT DISTINCT 
        CASE WHEN t.isactive THEN 'Active' ELSE 'Inactive' END::text as "value", 
        CASE WHEN t.isactive THEN 'Active' ELSE 'Inactive' END::text as "label" 
      FROM ${targetsTable} t 
      ${filterWhereClause ? `${filterWhereClause} AND` : 'WHERE'} t.isactive IS NOT NULL
      ORDER BY "value"
    `, filterParams).catch((e) => {
      console.error('Error fetching target status filter:', e)
      return { rows: [] }
    }),
    Promise.resolve({ rows: [] }),
    Promise.resolve({ rows: [] }),
    Promise.resolve({ rows: [] })
  ])

  return {
        users: usersResult.rows,
        teamLeaders: teamLeadersResult.rows,
        customers: customersResult.rows,
        years: yearsResult.rows,
        months: monthsResult.rows,
        chains: chainsResult.rows,
        brands: brandsResult.rows,
        categories: categoriesResult.rows,
        targetTypes: targetTypesResult.rows,
        targetStatus: targetStatusResult.rows,
        targetLevels: targetLevelResult.rows,
        salesOrgs: salesOrgResult.rows,
        userRoles: userRolesResult.rows
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    // Authentication removed - no user validation needed
    
    const { query, db } = await import('@/lib/database')
    await db.initialize()
    
    // Detect which targets table exists - with better error handling
    let targetsTable: string | null = null
    
    // Try to directly query each potential table - simplest approach
    const potentialTables = ['tblcommontarget', 'flat_targets']
    
    for (const tableName of potentialTables) {
      try {
        // Try a simple SELECT 1 query to see if table exists
        await query(`SELECT 1 FROM ${tableName} LIMIT 1`)
        targetsTable = tableName
        console.log(`✅ Found targets table: ${tableName}`)
        break
      } catch (e: any) {
        // Table doesn't exist or query failed - continue to next
        if (e?.message?.includes('does not exist')) {
          // Expected - table doesn't exist
          continue
        }
        // Other error - log but continue
        console.warn(`Could not access table ${tableName}:`, e?.message)
      }
    }
    
    // If still not found, search information_schema
    if (!targetsTable) {
      try {
        const tablesCheck = await query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND (table_name LIKE '%target%' OR table_name LIKE '%common%')
          ORDER BY table_name
        `)
        if (tablesCheck.rows.length > 0) {
          const foundTable = tablesCheck.rows[0].table_name
          // Verify we can actually query it
          try {
            await query(`SELECT 1 FROM ${foundTable} LIMIT 1`)
            targetsTable = foundTable
            console.log(`⚠️ Using detected targets table: ${targetsTable}`)
          } catch (e) {
            console.warn(`Detected table ${foundTable} but cannot query it:`, e)
          }
        }
      } catch (e) {
        console.warn('Could not search for target tables:', e)
      }
    }
    
    // If no targets table found, return empty filter options gracefully
    if (!targetsTable) {
      console.warn('⚠️ No targets table found. Returning empty filter options.')
      return NextResponse.json({
        success: true,
        data: {
          users: [],
          teamLeaders: [],
          customers: [],
          years: [],
          months: [],
          chains: [],
          brands: [],
          categories: [],
          targetTypes: [],
          targetStatus: [],
          targetLevels: [],
          salesOrgs: [],
          userRoles: []
        },
        timestamp: new Date().toISOString(),
        message: 'No targets table found in database. Please check if tblcommontarget or flat_targets table exists.'
      })
    }
    
    // Get filter parameters
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const userCode = searchParams.get('userCode')

    // Warn about unsupported filters
    if (searchParams.has('teamLeaderCode')) {
      console.warn('⚠️ teamLeaderCode filter not supported by tblcommontarget table')
    }
    if (searchParams.has('chainCode')) {
      console.warn('⚠️ chainCode filter not supported by tblcommontarget table')
    }
    if (searchParams.has('productBrand')) {
      console.warn('⚠️ productBrand filter not supported by tblcommontarget table')
    }

    // Create cache key
    const cacheKey = generateFilterCacheKey('targets', { year, month, userCode, table: targetsTable })
    
    // Fetch filters with caching (targets filters don't have date ranges, so always cache)
    const cachedFetchFilters = unstable_cache(
      async () => fetchTargetsFiltersInternal(targetsTable, year, month, userCode),
      [cacheKey],
      {
        revalidate: FILTERS_CACHE_DURATION,
        tags: ['targets-filters', `targets-filters-${targetsTable}`]
      }
    )

    const filterData = await cachedFetchFilters()

    return NextResponse.json({
      success: true,
      data: filterData,
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
    console.error('Targets Filters API error:', error)
    // If error is about missing table, return empty data instead of 500
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (errorMessage.includes('does not exist') || errorMessage.includes('No targets table')) {
      console.warn('⚠️ Targets table issue detected. Returning empty filter options.')
      return NextResponse.json({
        success: true,
        data: {
          users: [],
          teamLeaders: [],
          customers: [],
          years: [],
          months: [],
          chains: [],
          brands: [],
          categories: [],
          targetTypes: [],
          targetStatus: [],
          targetLevels: [],
          salesOrgs: [],
          userRoles: []
        },
        timestamp: new Date().toISOString(),
        message: 'No targets table found in database. Please check if tblcommontarget or flat_targets table exists.'
      })
    }
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: errorMessage
    }, { status: 500 })
  }
}

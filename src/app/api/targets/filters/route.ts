import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

/**
 * Target Filters API - Using tblCommonTarget for filter options
 * Returns filter options for the Target vs Achievement Report
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    await db.initialize()

    // Check if tblCommonTarget table exists
    let hasTargetTable = false
    try {
      await query(`SELECT 1 FROM "tblCommonTarget" LIMIT 1`)
      hasTargetTable = true
      console.log('✅ tblCommonTarget table found for filters')
    } catch (e: any) {
      if (e?.message?.includes('does not exist')) {
        console.warn('⚠️ tblCommonTarget table does not exist. Returning empty filters.')
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
          message: 'tblCommonTarget table not found. Please create it using create_targets_table.sql'
        })
      }
      throw e
    }

    // Get filter parameters for cascading filters
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const teamLeaderCode = searchParams.get('teamLeaderCode')

    console.log('🔍 Targets Filters API - Params:', { year, month, teamLeaderCode })

    // Build base conditions (using actual database column names)
    const baseConditions: string[] = [`t."IsActive" = TRUE`]
    const params: any[] = []
    let paramIndex = 1

    if (year) {
      baseConditions.push(`t."Year" = $${paramIndex}`)
      params.push(parseInt(year))
      paramIndex++
    }

    if (month) {
      baseConditions.push(`t."Month" = $${paramIndex}`)
      params.push(parseInt(month))
      paramIndex++
    }

    // Note: TeamLeaderCode doesn't exist in the actual table schema
    // if (teamLeaderCode) {
    //   baseConditions.push(`t."TeamLeaderCode" = $${paramIndex}`)
    //   params.push(teamLeaderCode)
    //   paramIndex++
    // }

    const whereClause = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : ''

    // Fetch all filter options in parallel (using actual database column names)
    const [usersResult, customersResult, yearsResult, monthsResult] = await Promise.all([
      // Users (field salesmen) - using SalesmanCode
      query(`
        SELECT
          t."SalesmanCode" as "value",
          MAX(COALESCE(u."Description", t."SalesmanCode")) || ' (' || t."SalesmanCode" || ')' as "label"
        FROM "tblCommonTarget" t
        LEFT JOIN "tblUser" u ON t."SalesmanCode" = u."Code"
        ${whereClause}
        AND t."SalesmanCode" IS NOT NULL
        GROUP BY t."SalesmanCode"
        ORDER BY 2
        LIMIT 500
      `, params),

      // Customers - using CustomerKey
      query(`
        SELECT
          t."CustomerKey" as "value",
          MAX(COALESCE(c."Description", t."CustomerKey")) || ' (' || t."CustomerKey" || ')' as "label"
        FROM "tblCommonTarget" t
        LEFT JOIN "tblCustomer" c ON t."CustomerKey" = c."Code"
        ${whereClause}
        AND t."CustomerKey" IS NOT NULL
        GROUP BY t."CustomerKey"
        ORDER BY 2
        LIMIT 500
      `, params),

      // Years - using Year column
      query(`
        SELECT DISTINCT
          t."Year"::text as "value",
          t."Year"::text as "label"
        FROM "tblCommonTarget" t
        WHERE t."IsActive" = TRUE
        ORDER BY t."Year"::text DESC
      `, []),

      // Months (static 1-12)
      Promise.resolve({
        rows: [
          { value: '1', label: '1' }, { value: '2', label: '2' },
          { value: '3', label: '3' }, { value: '4', label: '4' },
          { value: '5', label: '5' }, { value: '6', label: '6' },
          { value: '7', label: '7' }, { value: '8', label: '8' },
          { value: '9', label: '9' }, { value: '10', label: '10' },
          { value: '11', label: '11' }, { value: '12', label: '12' }
        ]
      })
    ])

    const filterData = {
      users: usersResult.rows || [],
      teamLeaders: [], // Not available in current schema
      customers: customersResult.rows || [],
      years: yearsResult.rows || [],
      months: monthsResult.rows || [],
      chains: [],
      brands: [],
      categories: [],
      targetTypes: [], // Not available in current schema
      targetStatus: [ // Derived from IsActive
        { value: 'Active', label: 'Active' },
        { value: 'Inactive', label: 'Inactive' }
      ],
      targetLevels: [
        { value: 'User', label: 'User Level' },
        { value: 'User-Customer', label: 'User-Customer Level' },
        { value: 'Team', label: 'Team Level' }
      ],
      salesOrgs: [],
      userRoles: []
    }

    console.log('✅ Targets Filters Response:', {
      users: filterData.users.length,
      teamLeaders: filterData.teamLeaders.length,
      customers: filterData.customers.length,
      years: filterData.years.length
    })

    return NextResponse.json({
      success: true,
      data: filterData,
      timestamp: new Date().toISOString(),
      source: 'tblCommonTarget'
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })
  } catch (error) {
    console.error('❌ Targets Filters API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch filter options',
      message: errorMessage,
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
      }
    }, { status: 500 })
  }
}

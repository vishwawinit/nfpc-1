import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// In-memory cache for filter results
const filterCache = new Map<string, { data: any; timestamp: number }>()
const FILTERS_CACHE_DURATION = 15 * 60 * 1000 // 15 minutes

function getDateRange(rangeStr: string) {
  const now = new Date()
  let startDate: Date, endDate: Date

  switch (rangeStr) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.setHours(23, 59, 59, 999))
      break
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      startDate = new Date(yesterday.setHours(0, 0, 0, 0))
      endDate = new Date(yesterday.setHours(23, 59, 59, 999))
      break
    case 'thisWeek':
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      startDate = new Date(weekStart.setHours(0, 0, 0, 0))
      endDate = new Date(now)
      break
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
      break
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
      endDate = new Date(now)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1
      startDate = new Date(now.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(now.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
  }

  return {
    startStr: startDate.toISOString().split('T')[0],
    endStr: endDate.toISOString().split('T')[0]
  }
}

// Build parameterized WHERE clause for filters
function buildWhereClause(params: {
  startDate: string
  endDate: string
  area?: string | null
  subArea?: string | null
  teamLeader?: string | null
  fieldUserRole?: string | null
  fieldUser?: string | null
  channel?: string | null
}) {
  const conditions: string[] = ['trx_trxtype = $1']
  const values: any[] = [1] // trx_trxtype = 1
  let paramIndex = 2

  // Date range
  conditions.push(`trx_trxdate >= $${paramIndex}::timestamp`)
  values.push(`${params.startDate} 00:00:00`)
  paramIndex++

  conditions.push(`trx_trxdate < ($${paramIndex}::date + INTERVAL '1 day')`)
  values.push(params.endDate)
  paramIndex++

  // Hierarchical filters
  if (params.area && params.area !== 'all') {
    conditions.push(`route_areacode = $${paramIndex}`)
    values.push(params.area)
    paramIndex++
  }
  if (params.subArea && params.subArea !== 'all') {
    conditions.push(`route_subareacode = $${paramIndex}`)
    values.push(params.subArea)
    paramIndex++
  }
  if (params.teamLeader && params.teamLeader !== 'all') {
    conditions.push(`route_salesmancode = $${paramIndex}`)
    values.push(params.teamLeader)
    paramIndex++
  }
  if (params.fieldUserRole && params.fieldUserRole !== 'all') {
    conditions.push(`user_usertype = $${paramIndex}`)
    values.push(params.fieldUserRole)
    paramIndex++
  }
  if (params.fieldUser && params.fieldUser !== 'all') {
    conditions.push(`trx_usercode = $${paramIndex}`)
    values.push(params.fieldUser)
    paramIndex++
  }
  if (params.channel && params.channel !== 'all') {
    conditions.push(`customer_channelcode = $${paramIndex}`)
    values.push(params.channel)
    paramIndex++
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
    paramIndex
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Initialize database connection with better error handling
    try {
      await db.initialize()
    } catch (dbError) {
      console.error('Database initialization failed:', dbError)
      return NextResponse.json({
        success: false,
        error: 'Database connection failed. Please check if you are connected to VPN or if the database server is accessible.',
        details: dbError instanceof Error ? dbError.message : 'Unknown database error'
      }, { status: 503 })
    }

    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    // Get hierarchical filter selections
    const areaFilter = searchParams.get('area')
    const subAreaFilter = searchParams.get('subArea')
    const teamLeaderFilter = searchParams.get('teamLeader')
    const fieldUserRoleFilter = searchParams.get('fieldUserRole')
    const fieldUserFilter = searchParams.get('fieldUser')
    const channelFilter = searchParams.get('channel')

    let startDate: string, endDate: string

    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const dateResult = getDateRange(range)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
    }

    // Create cache key
    const cacheKey = JSON.stringify({
      range, startDate, endDate,
      areaFilter, subAreaFilter, teamLeaderFilter,
      fieldUserRoleFilter, fieldUserFilter, channelFilter
    })

    // Check cache
    const cached = filterCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < FILTERS_CACHE_DURATION) {
      console.log(`Filters API cache hit (${Date.now() - startTime}ms)`)
      return NextResponse.json({
        ...cached.data,
        cached: true,
        cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
      })
    }

    // Build base WHERE clause with parameterized queries
    const baseWhere = buildWhereClause({
      startDate,
      endDate,
      area: areaFilter,
      subArea: subAreaFilter,
      teamLeader: teamLeaderFilter,
      fieldUserRole: fieldUserRoleFilter,
      fieldUser: fieldUserFilter,
      channel: channelFilter
    })

    // OPTIMIZATION: Run all filter queries in parallel with parameterized queries
    const [
      areasResult,
      subAreasResult,
      teamLeadersResult,
      fieldUserRolesResult,
      fieldUsersResult,
      channelsResult,
      customersResult,
      categoriesResult
    ] = await Promise.all([
      // Areas (exclude current area filter)
      query(`
        SELECT
          route_areacode as value,
          COALESCE(route_areacode, 'Unknown') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          subArea: subAreaFilter,
          teamLeader: teamLeaderFilter,
          fieldUserRole: fieldUserRoleFilter,
          fieldUser: fieldUserFilter,
          channel: channelFilter
        }).whereClause}
          AND route_areacode IS NOT NULL
          AND route_areacode != ''
        GROUP BY route_areacode
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        subArea: subAreaFilter,
        teamLeader: teamLeaderFilter,
        fieldUserRole: fieldUserRoleFilter,
        fieldUser: fieldUserFilter,
        channel: channelFilter
      }).values),

      // Sub Areas (filtered by area if selected)
      query(`
        SELECT
          route_subareacode as value,
          COALESCE(route_subareacode, 'Unknown') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          area: areaFilter,
          teamLeader: teamLeaderFilter,
          fieldUserRole: fieldUserRoleFilter,
          fieldUser: fieldUserFilter,
          channel: channelFilter
        }).whereClause}
          AND route_subareacode IS NOT NULL
          AND route_subareacode != ''
        GROUP BY route_subareacode
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        area: areaFilter,
        teamLeader: teamLeaderFilter,
        fieldUserRole: fieldUserRoleFilter,
        fieldUser: fieldUserFilter,
        channel: channelFilter
      }).values),

      // Team Leaders (filtered by area and sub area if selected)
      query(`
        SELECT
          route_salesmancode as value,
          COALESCE(route_salesmancode, 'Unknown') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          area: areaFilter,
          subArea: subAreaFilter,
          fieldUserRole: fieldUserRoleFilter,
          fieldUser: fieldUserFilter,
          channel: channelFilter
        }).whereClause}
          AND route_salesmancode IS NOT NULL
          AND route_salesmancode != ''
        GROUP BY route_salesmancode
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        area: areaFilter,
        subArea: subAreaFilter,
        fieldUserRole: fieldUserRoleFilter,
        fieldUser: fieldUserFilter,
        channel: channelFilter
      }).values),

      // Field User Roles
      query(`
        SELECT
          user_usertype as value,
          COALESCE(user_usertype, 'Unknown') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          area: areaFilter,
          subArea: subAreaFilter,
          teamLeader: teamLeaderFilter,
          fieldUser: fieldUserFilter,
          channel: channelFilter
        }).whereClause}
          AND user_usertype IS NOT NULL
          AND user_usertype != ''
        GROUP BY user_usertype
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        area: areaFilter,
        subArea: subAreaFilter,
        teamLeader: teamLeaderFilter,
        fieldUser: fieldUserFilter,
        channel: channelFilter
      }).values),

      // Field Users (filtered by previous selections)
      query(`
        SELECT
          trx_usercode as value,
          COALESCE(user_description, trx_usercode) || ' (' || trx_usercode || ')' as label,
          COALESCE(user_usertype, 'Unknown') as role,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          area: areaFilter,
          subArea: subAreaFilter,
          teamLeader: teamLeaderFilter,
          fieldUserRole: fieldUserRoleFilter,
          channel: channelFilter
        }).whereClause}
          AND trx_usercode IS NOT NULL
          AND trx_usercode != ''
        GROUP BY trx_usercode, user_description, user_usertype
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        area: areaFilter,
        subArea: subAreaFilter,
        teamLeader: teamLeaderFilter,
        fieldUserRole: fieldUserRoleFilter,
        channel: channelFilter
      }).values),

      // Channels (filtered by previous selections)
      query(`
        SELECT
          customer_channelcode as value,
          COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${buildWhereClause({
          startDate,
          endDate,
          area: areaFilter,
          subArea: subAreaFilter,
          teamLeader: teamLeaderFilter,
          fieldUserRole: fieldUserRoleFilter,
          fieldUser: fieldUserFilter
        }).whereClause}
          AND customer_channelcode IS NOT NULL
          AND customer_channelcode != ''
        GROUP BY customer_channelcode, customer_channel_description
        ORDER BY label
      `, buildWhereClause({
        startDate,
        endDate,
        area: areaFilter,
        subArea: subAreaFilter,
        teamLeader: teamLeaderFilter,
        fieldUserRole: fieldUserRoleFilter,
        fieldUser: fieldUserFilter
      }).values),

      // Customers (filtered by all previous selections)
      query(`
        SELECT
          customer_code as value,
          COALESCE(customer_description, customer_code) || ' (' || customer_code || ')' as label,
          COALESCE(customer_channel_description, 'Unknown') as channel,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${baseWhere.whereClause}
          AND customer_code IS NOT NULL
          AND customer_code != ''
        GROUP BY customer_code, customer_description, customer_channel_description
        ORDER BY count DESC
        LIMIT 100
      `, baseWhere.values),

      // Product Categories
      query(`
        SELECT
          item_category_description as value,
          COALESCE(item_category_description, 'Uncategorized') as label,
          COUNT(DISTINCT trx_trxcode) as count
        FROM flat_daily_sales_report
        ${baseWhere.whereClause}
          AND item_category_description IS NOT NULL
          AND item_category_description != ''
        GROUP BY item_category_description
        ORDER BY label
      `, baseWhere.values)
    ])

    console.log(`Orders Filters API completed in ${Date.now() - startTime}ms`)
    console.log('Orders Filters - Response counts:', {
      areas: areasResult.rows.length,
      subAreas: subAreasResult.rows.length,
      teamLeaders: teamLeadersResult.rows.length,
      fieldUserRoles: fieldUserRolesResult.rows.length,
      fieldUsers: fieldUsersResult.rows.length,
      channels: channelsResult.rows.length,
      customers: customersResult.rows.length,
      categories: categoriesResult.rows.length
    })

    const responseData = {
      success: true,
      filters: {
        areas: areasResult.rows || [],
        subAreas: subAreasResult.rows || [],
        teamLeaders: teamLeadersResult.rows || [],
        fieldUserRoles: fieldUserRolesResult.rows || [],
        fieldUsers: fieldUsersResult.rows || [],
        channels: channelsResult.rows || [],
        customers: customersResult.rows || [],
        productCategories: categoriesResult.rows || []
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: range
      },
      queryTime: Date.now() - startTime,
      cached: false
    }

    // Store in cache
    filterCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    })

    // Clean old cache entries (keep last 50)
    if (filterCache.size > 50) {
      const entries = Array.from(filterCache.entries())
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp)
      filterCache.clear()
      entries.slice(0, 50).forEach(([key, value]) => filterCache.set(key, value))
    }

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `public, s-maxage=900, stale-while-revalidate=1800`
      }
    })

  } catch (error) {
    console.error('Orders filters API error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      queryTime: Date.now() - startTime
    }, { status: 500 })
  }
}

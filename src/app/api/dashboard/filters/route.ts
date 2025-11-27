import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Table name constant
const SALES_TABLE = 'flat_daily_sales_report'

// Fetch dashboard filters from flat_daily_sales_report table
async function fetchDashboardFiltersInternal(params: {
  startDate: string | null
  endDate: string | null
  areaCode: string | null
  subAreaCode: string | null
  fieldUserRole: string | null
  teamLeaderCode: string | null
  userCode: string | null
  chainName: string | null
  storeCode: string | null
}) {
  const {
    startDate,
    endDate,
    areaCode,
    subAreaCode,
    fieldUserRole,
    teamLeaderCode,
    userCode,
    chainName,
    storeCode
  } = params

  // Build dynamic where clause for availability counts
  const buildAvailabilityWhere = (excludeField?: string) => {
    const conditions = []
    conditions.push(`UPPER(COALESCE(trx_usercode, '')) NOT LIKE '%DEMO%'`)
    conditions.push(`UPPER(COALESCE(route_areacode, '')) NOT LIKE '%DEMO%'`)
    conditions.push(`trx_trxtype = 1`)

    if (startDate && endDate) {
      conditions.push(`trx_trxdate >= '${startDate}'::timestamp`)
      conditions.push(`trx_trxdate < ('${endDate}'::timestamp + INTERVAL '1 day')`)
    }

    if (areaCode && excludeField !== 'area') {
      conditions.push(`route_areacode = '${areaCode}'`)
    }
    if (subAreaCode && excludeField !== 'subArea') {
      conditions.push(`route_subareacode = '${subAreaCode}'`)
    }
    if (fieldUserRole && excludeField !== 'fieldUserRole') {
      conditions.push(`COALESCE(user_usertype, 'Field User') = '${fieldUserRole}'`)
    }
    if (teamLeaderCode && excludeField !== 'teamLeader') {
      conditions.push(`route_salesmancode = '${teamLeaderCode}'`)
    }
    if (userCode && excludeField !== 'user') {
      conditions.push(`trx_usercode = '${userCode}'`)
    }
    if (chainName && excludeField !== 'chain') {
      conditions.push(`customer_channel_description = '${chainName}'`)
    }
    if (storeCode && excludeField !== 'store') {
      conditions.push(`customer_code = '${storeCode}'`)
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  }

  // Fetch all filter options in parallel
  const [
    areasResult,
    subAreasResult,
    fieldUserRolesResult,
    teamLeadersResult,
    fieldUsersResult,
    chainsResult,
    storesResult,
    dateRangeResult
  ] = await Promise.all([
    // Get areas
    query(`
      SELECT
        route_areacode as "value",
        route_areacode as "label",
        COUNT(*) as "transactionCount"
      FROM ${SALES_TABLE}
      ${buildAvailabilityWhere('area')}
      GROUP BY route_areacode
      HAVING route_areacode IS NOT NULL
      AND route_areacode != ''
      AND UPPER(route_areacode) NOT LIKE '%DEMO%'
      ORDER BY route_areacode
    `),

    // Get sub areas
    query(`
      SELECT
        route_subareacode as "value",
        route_subareacode as "label",
        COUNT(*) as "transactionCount",
        COUNT(DISTINCT customer_code) as "storeCount"
      FROM ${SALES_TABLE}
      ${buildAvailabilityWhere('subArea')}
      GROUP BY route_subareacode
      HAVING route_subareacode IS NOT NULL
      AND route_subareacode != ''
      AND UPPER(route_subareacode) NOT LIKE '%DEMO%'
      ORDER BY route_subareacode
    `),

    // Get field user roles
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

    // Get team leaders
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
      LIMIT 500
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

  // Format results
  const areas = areasResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    available: parseInt(row.transactionCount) || 0
  })).filter(r => r.available > 0 || r.value === areaCode)

  const subAreas = subAreasResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    available: parseInt(row.transactionCount) || 0,
    storeCount: parseInt(row.storeCount) || 0
  })).filter(c => c.available > 0 || c.value === subAreaCode)

  const fieldUserRoles = fieldUserRolesResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    available: parseInt(row.transactionCount) || 0
  })).filter(r => r.available > 0 || r.value === fieldUserRole)

  const teamLeaders = teamLeadersResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    available: parseInt(row.transactionCount) || 0
  })).filter(tl => tl.available > 0 || tl.value === teamLeaderCode)

  const fieldUsers = fieldUsersResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    role: row.role,
    available: parseInt(row.transactionCount) || 0
  })).filter(u => u.available > 0 || u.value === userCode)

  const chains = chainsResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    available: parseInt(row.transactionCount) || 0,
    storeCount: parseInt(row.storeCount) || 0
  })).filter(c => c.available > 0 || c.value === chainName)

  const stores = storesResult.rows.map(row => ({
    value: row.value,
    label: row.label,
    chainName: row.chainName,
    available: parseInt(row.transactionCount) || 0
  })).filter(s => s.available > 0 || s.value === storeCode)

  // Get date range info
  const dateRange = dateRangeResult.rows[0] || {}

  // Calculate summary statistics
  const summary = {
    totalAreas: areas.length,
    totalSubAreas: subAreas.length,
    totalUsers: fieldUsers.length,
    totalTeamLeaders: teamLeaders.length,
    totalChains: chains.length,
    totalStores: stores.length,
    totalCustomers: stores.length,
    totalChannels: chains.length,
    totalWarehouses: 0, // Not available in flat table
    dateRange: {
      min: dateRange.minDate,
      max: dateRange.maxDate,
      daysWithData: dateRange.daysWithData || 0
    }
  }

  return {
    areas,
    subAreas,
    regions: areas, // Alias for backward compatibility
    cities: subAreas, // Alias for backward compatibility
    routes: subAreas, // Alias
    fieldUserRoles,
    teamLeaders,
    fieldUsers,
    users: fieldUsers, // Alias
    salesmen: fieldUsers, // Alias
    channels: chains,
    chains,
    stores,
    customers: stores, // Alias
    summary,
    warehouses: [], // Empty as not available in flat table
    depots: [] // Empty as not available in flat table
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Get filter parameters - support both old (region/city) and new (area/subArea) names
    const params = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      areaCode: searchParams.get('areaCode') || searchParams.get('regionCode'),
      subAreaCode: searchParams.get('subAreaCode') || searchParams.get('cityCode'),
      fieldUserRole: searchParams.get('fieldUserRole'),
      teamLeaderCode: searchParams.get('teamLeaderCode'),
      userCode: searchParams.get('userCode'),
      chainName: searchParams.get('chainName'),
      storeCode: searchParams.get('storeCode')
    }

    const filterData = await fetchDashboardFiltersInternal(params)

    return NextResponse.json({
      success: true,
      data: filterData,
      timestamp: new Date().toISOString(),
      source: 'flat_daily_sales_report'
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

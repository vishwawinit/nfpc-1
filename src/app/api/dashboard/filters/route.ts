import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Fetch dashboard filters from real database tables
async function fetchDashboardFiltersInternal() {
  // Initialize arrays for filter options
  let regions: any[] = []
  let warehouses: any[] = []
  let routes: any[] = []
  let users: any[] = []
  let channels: any[] = []
  let customers: any[] = []

  // Fetch all filters in parallel from real tables
  await Promise.all([
    // Fetch regions from tblRegion
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Description" as label,
        "CountryCode" as country
      FROM "tblRegion"
      WHERE "IsActive" = true
      ORDER BY "Description"
    `).then(result => { regions = result.rows || [] }).catch(err => console.error('Error fetching regions:', err)),

    // Fetch warehouses/depots from tblWarehouse
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Description" as label,
        "SalesOrgCode" as org_code
      FROM "tblWarehouse"
      WHERE "IsActive" = true
      ORDER BY "Description"
    `).then(result => { warehouses = result.rows || [] }).catch(err => console.error('Error fetching warehouses:', err)),

    // Fetch routes from tblRoute
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Name" as label,
        "SalesmanCode" as salesman_code,
        "WHCode" as warehouse_code,
        "AreaCode" as area_code
      FROM "tblRoute"
      WHERE "IsActive" = true
      ORDER BY "Name"
    `).then(result => { routes = result.rows || [] }).catch(err => console.error('Error fetching routes:', err)),

    // Fetch users/salesmen from tblUser - get all active users
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Description" as label,
        "UserType" as user_type,
        "Department" as department
      FROM "tblUser"
      WHERE "IsActive" = true
      ORDER BY "Description"
    `).then(result => { users = result.rows || [] }).catch(err => console.error('Error fetching users:', err)),

    // Fetch channels from tblChannel
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Description" as label
      FROM "tblChannel"
      WHERE "IsActive" = true
      ORDER BY "Description"
    `).then(result => { channels = result.rows || [] }).catch(err => console.error('Error fetching channels:', err)),

    // Fetch top customers from tblCustomer
    query(`
      SELECT DISTINCT
        "Code" as value,
        "Description" as label,
        "RegionCode" as region,
        "RouteCode" as route_code
      FROM "tblCustomer"
      WHERE "IsActive" = true
      AND "IsBlocked" = false
      ORDER BY "Description"
      LIMIT 500
    `).then(result => { customers = result.rows || [] }).catch(err => console.error('Error fetching customers:', err))
  ])

  // Get date range from transactions
  let dateRange = { min: '', max: '', daysWithData: 0 }
  try {
    const dateResult = await query(`
      SELECT
        MIN(DATE("TrxDate"))::text as min_date,
        MAX(DATE("TrxDate"))::text as max_date,
        COUNT(DISTINCT DATE("TrxDate")) as days_with_data
      FROM "tblTrxHeader"
      WHERE "TrxType" = 1
    `)
    if (dateResult.rows[0]) {
      dateRange = {
        min: dateResult.rows[0].min_date || '',
        max: dateResult.rows[0].max_date || '',
        daysWithData: parseInt(dateResult.rows[0].days_with_data || '0')
      }
    }
  } catch (err) {
    console.error('Error fetching date range:', err)
  }

  return {
    regions,
    warehouses,
    depots: warehouses, // Alias
    routes,
    users,
    salesmen: users, // Alias
    channels,
    customers,
    stores: customers, // Alias
    summary: {
      totalRegions: regions.length,
      totalWarehouses: warehouses.length,
      totalRoutes: routes.length,
      totalUsers: users.length,
      totalChannels: channels.length,
      totalCustomers: customers.length,
      dateRange
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const filterData = await fetchDashboardFiltersInternal()

    return NextResponse.json({
      success: true,
      data: filterData,
      timestamp: new Date().toISOString(),
      source: 'postgresql-real-tables'
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

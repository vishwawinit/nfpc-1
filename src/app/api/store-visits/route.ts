import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getCacheControlHeader } from '@/lib/cache-utils'
import { getChildUsers, isAdmin } from '@/lib/mssql'
import { validateApiUser } from '@/lib/apiUserValidation'
import { apiCache } from '@/lib/apiCache'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/store-visits', searchParams)
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

    console.log('🔄 Fetching fresh store visits data from database...')

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Date filters - handle timezone properly
    if (searchParams.has('startDate')) {
      conditions.push(`DATE(v.visit_date) >= $${paramIndex}::date`)
      params.push(searchParams.get('startDate'))
      paramIndex++
    }

    if (searchParams.has('endDate')) {
      conditions.push(`DATE(v.visit_date) <= $${paramIndex}::date`)
      params.push(searchParams.get('endDate'))
      paramIndex++
    }

    // User filter
    if (searchParams.has('userCode')) {
      conditions.push(`v.user_code = $${paramIndex}`)
      params.push(searchParams.get('userCode'))
      paramIndex++
    }

    // Store filter
    if (searchParams.has('storeCode')) {
      conditions.push(`v.customer_code = $${paramIndex}`)
      params.push(searchParams.get('storeCode'))
      paramIndex++
    }

    // Team Leader filter
    if (searchParams.has('teamLeaderCode')) {
      conditions.push(`v.route_code = $${paramIndex}`)
      params.push(searchParams.get('teamLeaderCode'))
      paramIndex++
    }

    // City filter
    if (searchParams.has('cityCode')) {
      conditions.push(`v.city_code = $${paramIndex}`)
      params.push(searchParams.get('cityCode'))
      paramIndex++
    }

    // Visit Purpose filter
    if (searchParams.has('visitPurpose')) {
      conditions.push(`v.type_of_call = $${paramIndex}`)
      params.push(searchParams.get('visitPurpose'))
      paramIndex++
    }

    // Visit Outcome filter
    if (searchParams.has('visitOutcome')) {
      conditions.push(`v.is_productive = $${paramIndex}`)
      params.push(searchParams.get('visitOutcome'))
      paramIndex++
    }

    // Chain filter (support both chainCode and chainName params)
    if (searchParams.has('chainCode')) {
      conditions.push(`v.channel_code = $${paramIndex}`)
      params.push(searchParams.get('chainCode'))
      paramIndex++
    } else if (searchParams.has('chainName')) {
      conditions.push(`v.channel_name = $${paramIndex}`)
      params.push(searchParams.get('chainName'))
      paramIndex++
    }

    // Region filter
    if (searchParams.has('regionCode')) {
      conditions.push(`v.region_code = $${paramIndex}`)
      params.push(searchParams.get('regionCode'))
      paramIndex++
    }

    // Hierarchy filter - apply if allowedUserCodes is provided
    if (allowedUserCodes.length > 0) {
      const placeholders = allowedUserCodes.map((_, index) => `$${paramIndex + index}`).join(', ')
      conditions.push(`v.user_code IN (${placeholders})`)
      params.push(...allowedUserCodes)
      paramIndex += allowedUserCodes.length
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get limit - default to large number to get all data
    const limit = parseInt(searchParams.get('limit') || '100000')

    // Fetch store visits from flat_customer_visit table with actual sales data
    const result = await query(`
      SELECT
        DATE(v.visit_date) as "visitDate",
        v.customer_code as "storeCode",
        v.customer_name as "storeName",
        v.channel_code as "chainCode",
        v.channel_name as "chainName",
        v.city_code as "cityCode",
        v.region_code as "regionCode",
        v.user_code as "userCode",
        v.user_name as "userName",
        v.user_type as "userType",
        v.route_code as "teamLeaderCode",
        v.sub_area_code as "teamLeaderName",
        v.arrival_time as "arrivalTime",
        v.out_time as "departureTime",
        COALESCE(v.total_time_mins, 0) as "durationMinutes",
        v.type_of_call as "visitPurpose",
        CASE
          WHEN COALESCE(s.total_sales, 0) > 0 THEN 'Productive'
          ELSE 'Non-Productive'
        END as "visitOutcome",
        v.non_productive_reason as "remarks",
        v.visit_latitude as "latitude",
        v.visit_longitude as "longitude",
        COALESCE(s.total_sales, 0) as "salesGenerated",
        COALESCE(s.products_count, 0) as "productsOrdered"
      FROM flat_customer_visit v
      LEFT JOIN (
        SELECT
          trx_usercode,
          customer_code,
          DATE(trx_trxdate) as sale_date,
          SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
          COUNT(DISTINCT line_itemcode) as products_count
        FROM flat_daily_sales_report
        WHERE trx_trxtype = 1
        GROUP BY trx_usercode, customer_code, DATE(trx_trxdate)
      ) s ON v.user_code = s.trx_usercode
        AND v.customer_code = s.customer_code
        AND DATE(v.visit_date) = s.sale_date
      ${whereClause}
      ORDER BY v.visit_date DESC, v.arrival_time DESC
      LIMIT $${paramIndex}
    `, [...params, limit])

    // Log data stats for debugging
    console.log('=== STORE VISITS API DEBUG ===')
    console.log('Total rows from DB:', result.rows.length)
    
    if (result.rows.length > 0) {
      // Calculate duration statistics
      const durations = result.rows
        .map(r => parseFloat(r.durationMinutes) || 0)
        .filter(d => d > 0)
      
      const totalDuration = durations.reduce((sum, d) => sum + d, 0)
      const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0
      const maxDuration = durations.length > 0 ? Math.max(...durations) : 0
      const visitsOver4Hours = durations.filter(d => d > 240).length
      
      console.log('Duration Analysis:')
      console.log('  - Total visits with duration:', durations.length)
      console.log('  - Average duration (mins):', Math.round(avgDuration))
      console.log('  - Max duration (mins):', Math.round(maxDuration))
      console.log('  - Visits over 4 hours:', visitsOver4Hours)
      console.log('  - Total duration (hours):', Math.round(totalDuration / 60))
      
      console.log('\nFirst 3 visits sample:', result.rows.slice(0, 3).map(row => ({
        visitDate: row.visitDate,
        storeName: row.storeName,
        userName: row.userName,
        arrivalTime: row.arrivalTime,
        departureTime: row.departureTime,
        durationMinutes: row.durationMinutes,
        salesGenerated: row.salesGenerated,
        visitOutcome: row.visitOutcome
      })))

      // Check for GPS data
      const withGPS = result.rows.filter(r => r.latitude && r.longitude).length
      console.log(`Visits with GPS: ${withGPS} / ${result.rows.length}`)

      // Sales analysis
      const withSales = result.rows.filter(r => parseFloat(r.salesGenerated) > 0).length
      const totalSales = result.rows.reduce((sum, r) => sum + parseFloat(r.salesGenerated || '0'), 0)
      console.log(`Productive visits (with sales): ${withSales} / ${result.rows.length}`)
      console.log(`Total sales: AED ${totalSales.toLocaleString()}`)

      // Check unique users
      const uniqueUsers = new Set(result.rows.map(r => r.userCode)).size
      console.log(`Unique users: ${uniqueUsers}`)

      // Check date range
      const dates = result.rows.map(r => r.visitDate).filter(d => d)
      if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates.map((d: string) => new Date(d).getTime())))
        const maxDate = new Date(Math.max(...dates.map((d: string) => new Date(d).getTime())))
        console.log(`Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`)
      }
    }
    console.log('==============================')

    const visits = result.rows.map(row => ({
      visitDate: row.visitDate,
      storeCode: row.storeCode,
      storeName: row.storeName,
      chainCode: row.chainCode,
      chainName: row.chainName,
      cityCode: row.cityCode,
      regionCode: row.regionCode,
      userCode: row.userCode,
      userName: row.userName,
      userType: row.userType,
      teamLeaderCode: row.teamLeaderCode || '',
      teamLeaderName: row.teamLeaderName || '',
      arrivalTime: row.arrivalTime || '',
      departureTime: row.departureTime || '',
      durationMinutes: Math.round(parseFloat(row.durationMinutes || '0')),
      visitPurpose: row.visitPurpose,
      visitOutcome: row.visitOutcome,
      remarks: row.remarks,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      salesGenerated: parseFloat(row.salesGenerated || '0'),
      productsOrdered: parseInt(row.productsOrdered || '0')
    }))

    // Calculate cache duration based on date range span
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    let cacheDuration = 1800 // default 30 mins
    
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDiff <= 2) cacheDuration = 600
      else if (daysDiff <= 7) cacheDuration = 900
      else if (daysDiff <= 31) cacheDuration = 1800
      else cacheDuration = 3600
    }

    const responseJson = {
      success: true,
      data: visits,
      count: visits.length,
      timestamp: new Date().toISOString(),
      source: 'postgresql-flat-customer-visit',
      cached: false,
      cacheInfo: { duration: cacheDuration }
    }

    // Store in cache
    apiCache.set('/api/store-visits', searchParams, responseJson)

    return NextResponse.json(responseJson, {
      headers: {
        'Cache-Control': getCacheControlHeader(cacheDuration)
      }
    })

  } catch (error) {
    console.error('Store Visits API error:', error)
    console.error('Query params:', {
      startDate: request.nextUrl.searchParams.get('startDate'),
      endDate: request.nextUrl.searchParams.get('endDate'),
      userCode: request.nextUrl.searchParams.get('userCode'),
      storeCode: request.nextUrl.searchParams.get('storeCode'),
      teamLeaderCode: request.nextUrl.searchParams.get('teamLeaderCode'),
      chainName: request.nextUrl.searchParams.get('chainName'),
      regionCode: request.nextUrl.searchParams.get('regionCode')
    })

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch store visits',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

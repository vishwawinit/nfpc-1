import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { unstable_cache } from 'next/cache'
import { shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader, getCacheDuration } from '@/lib/cache-utils'

export const dynamic = 'force-dynamic'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  // If empty string or invalid, default to last 30 days
  if (!dateRange || dateRange.trim() === '') {
    const current = new Date()
    const startDate = new Date(current)
    startDate.setDate(startDate.getDate() - 29)
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: current.toISOString().split('T')[0]
    }
  }

  const current = new Date()
  let startDate: Date
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      startDate = new Date(current)
      break
    case 'yesterday':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'thisWeek':
    case 'last7Days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'last30Days':
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(current.getMonth() / 3)
      startDate = new Date(current.getFullYear(), quarter * 3, 1)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(current.getMonth() / 3) - 1
      startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      break
    case 'custom':
      // For custom, return current month as default (will be overridden by custom dates)
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }
}

// Internal function to fetch sales trend data (will be cached)
async function fetchSalesTrendInternal(params: {
  days: number
  dateRange: string
  regionCode: string | null
  cityCode: string | null
  teamLeaderCode: string | null
  fieldUserRole: string | null
  userCode: string | null
  chainName: string | null
  storeCode: string | null
  customStartDate: string | null
  customEndDate: string | null
}) {
  const { query } = await import('@/lib/database')
  const {
    days,
    dateRange,
    regionCode,
    cityCode,
    teamLeaderCode,
    fieldUserRole,
    userCode,
    chainName,
    storeCode,
    customStartDate,
    customEndDate
  } = params

    // ALWAYS prioritize custom dates if provided - they override any preset range
    let startDate: string, endDate: string
    if (customStartDate && customEndDate) {
      // Use custom dates if provided (from query params startDate/endDate)
      // These come from the dashboard filters and should always be used
      startDate = customStartDate
      endDate = customEndDate
      console.log('Sales Trend: Using custom date range from filters:', { startDate, endDate, dateRange })
    } else {
      // Fall back to preset range only if no custom dates provided
      const rangeToUse = dateRange || 'last30Days'
      const dateRangeResult = getDateRangeFromString(rangeToUse)
      startDate = dateRangeResult.startDate
      endDate = dateRangeResult.endDate
      console.log('Sales Trend: Using preset range (no custom dates):', { rangeToUse, startDate, endDate })
    }

    // Build WHERE conditions - optimized for index usage
    const conditions: string[] = []
  const queryParams: any[] = []
    let paramIndex = 1

    // Optimized date filtering - use date range directly on indexed column (no DATE() function)
    // This allows PostgreSQL to use indexes on transaction_date
    conditions.push(`t.transaction_date >= $${paramIndex}::date`)
  queryParams.push(startDate)
    paramIndex++
    conditions.push(`t.transaction_date < ($${paramIndex}::date + INTERVAL '1 day')`)
  queryParams.push(endDate)
    paramIndex++
    
    // Filter out NULL order_total but include both positive and negative for proper aggregation
    conditions.push(`t.order_total IS NOT NULL`)

    // Region filter - use state from customers master
    if (regionCode) {
      conditions.push(`c.state = $${paramIndex}`)
    queryParams.push(regionCode)
      paramIndex++
    }

    // City filter
    if (cityCode) {
      conditions.push(`c.city = $${paramIndex}`)
    queryParams.push(cityCode)
      paramIndex++
    }

    // Team Leader filter - using sales_person_code
    if (teamLeaderCode) {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
    queryParams.push(teamLeaderCode)
      paramIndex++
    }

    // Field User Role filter - using sales_person_code
    if (fieldUserRole) {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
    queryParams.push(fieldUserRole)
      paramIndex++
    }

    // User filter
    if (userCode) {
      conditions.push(`t.user_code = $${paramIndex}`)
    queryParams.push(userCode)
      paramIndex++
    }

    // Chain filter
    if (chainName) {
      conditions.push(`c.customer_type = $${paramIndex}`)
    queryParams.push(chainName)
      paramIndex++
    }

    // Store filter
    if (storeCode) {
      conditions.push(`t.customer_code = $${paramIndex}`)
    queryParams.push(storeCode)
      paramIndex++
    }

    // Check if we need customer master join (only if filters require it)
    const needsCustomerJoin = !!(regionCode || cityCode || teamLeaderCode || fieldUserRole || chainName)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Determine grouping and aggregation based on actual day span
    // This ensures correct aggregation regardless of whether custom dates or preset range is used
    let dateGrouping = ''
    let orderBy = ''

    const start = new Date(startDate)
    const end = new Date(endDate)
    const msInDay = 24 * 60 * 60 * 1000
    const daySpan = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msInDay) + 1)
    
    console.log('Sales Trend - Date span calculation:', {
      startDate,
      endDate,
      daySpan,
      willUseCustomDates: !!(customStartDate && customEndDate)
    })

    if (daySpan <= 14) {
      // Daily aggregation for up to ~2 weeks
      dateGrouping = `DATE(t.transaction_date)`
      orderBy = `DATE(t.transaction_date)`
    } else if (daySpan <= 92) {
      // Weekly aggregation for ~2 weeks to ~3 months
      dateGrouping = `DATE_TRUNC('week', t.transaction_date)`
      orderBy = `DATE_TRUNC('week', t.transaction_date)`
    } else {
      // Monthly aggregation for longer ranges
      dateGrouping = `DATE_TRUNC('month', t.transaction_date)`
      orderBy = `DATE_TRUNC('month', t.transaction_date)`
    }

    // Optimized sales trend query - simplified aggregations for better performance
    // Single query with conditional JOIN - much faster than separate CTEs
    // Note: Using order_total for transaction amounts, include all transactions and aggregate separately
    const result = await query(`
      SELECT
        ${dateGrouping}::date as date,
        ROUND(COALESCE(SUM(CASE WHEN t.order_total > 0 THEN t.order_total ELSE 0 END), 0), 2) as sales,
        COUNT(DISTINCT CASE WHEN t.order_total > 0 THEN t.transaction_code END) as orders,
        COUNT(DISTINCT CASE WHEN t.order_total > 0 THEN t.customer_code END) as customers,
        ROUND(COALESCE(ABS(SUM(CASE WHEN t.order_total < 0 THEN t.order_total ELSE 0 END)), 0), 2) as returns,
        ROUND(COALESCE(SUM(CASE WHEN t.order_total > 0 THEN COALESCE(t.quantity_bu, 0) ELSE 0 END), 0), 0) as quantity
      FROM flat_transactions t
      ${needsCustomerJoin ? `LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code` : ''}
      ${whereClause}
      GROUP BY ${dateGrouping}
      ORDER BY ${orderBy} ASC
  `, queryParams)
    
    // Log query details for debugging
    console.log('Sales Trend Query:', {
      dateRange: customStartDate && customEndDate ? 'custom' : (dateRange || 'last30Days'),
      startDate,
      endDate,
      daySpan,
      dateGrouping,
      needsCustomerJoin,
      rowCount: result.rows.length,
      sampleRow: result.rows[0],
      usingCustomDates: !!(customStartDate && customEndDate)
    })

    const trendData = result.rows.map(row => ({
      date: row.date,
      sales: parseFloat(row.sales || '0'),
      orders: parseInt(row.orders || '0'),
      customers: parseInt(row.customers || '0'),
      returns: parseFloat(row.returns || '0'),
      quantity: parseInt(row.quantity || '0')
    }))

    // Determine aggregation type for frontend based on actual date span
    // Use daySpan to determine aggregation, not just the range parameter
    let aggregation = 'daily'
    if (daySpan > 365) {
      aggregation = 'monthly'
    } else if (daySpan > 92) {
      aggregation = 'weekly'
    } else {
      aggregation = 'daily'
    }

  return {
    data: trendData,
    dateRange: customStartDate && customEndDate ? 'custom' : (dateRange || 'last30Days'),
    aggregation,
    days,
    startDate,
    endDate
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const days = parseInt(searchParams.get('days') || '30')
    const dateRange = searchParams.get('range') || ''

    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('city') || searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    // Get custom dates from query params - these take priority over preset ranges
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Always prioritize custom dates if provided, regardless of range parameter
    // If custom dates are provided, they will be used in fetchSalesTrendInternal
    const rangeToUse = dateRange || 'last30Days'
    
    console.log('Sales Trend API - Date parameters:', {
      dateRange,
      customStartDate,
      customEndDate,
      rangeToUse,
      willUseCustomDates: !!(customStartDate && customEndDate),
      note: customStartDate && customEndDate ? 'Custom dates will override range' : 'Using preset range'
    })
    
    // Check if we should cache (excludes "today" and custom date ranges)
    const shouldCache = shouldCacheFilters(rangeToUse, customStartDate, customEndDate)
    const hasCustomDates = !!(customStartDate && customEndDate)
    const cacheDuration = getCacheDuration(rangeToUse, hasCustomDates)

    // Build filter parameters for cache key generation
    // Include all filter parameters to ensure unique cache entries per filter combination
    const filterParams = {
      days: days.toString(),
      dateRange: rangeToUse,
      regionCode: regionCode || '',
      cityCode: cityCode || '',
      teamLeaderCode: teamLeaderCode || '',
      fieldUserRole: fieldUserRole || '',
      userCode: userCode || '',
      chainName: chainName || '',
      storeCode: storeCode || '',
      customStartDate: customStartDate || '',
      customEndDate: customEndDate || ''
    }

    let trendData
    if (shouldCache) {
      // Generate unique cache key based on all filter parameters
      const cacheKey = generateFilterCacheKey('dashboard-sales-trend', filterParams)
      
      // Use unstable_cache to cache the query results
      const cachedFetchTrend = unstable_cache(
        async () => fetchSalesTrendInternal({
          days,
          dateRange: rangeToUse,
          regionCode,
          cityCode,
          teamLeaderCode,
          fieldUserRole,
          userCode,
          chainName,
          storeCode,
          customStartDate,
          customEndDate
        }),
        [cacheKey],
        {
          revalidate: cacheDuration,
          tags: ['dashboard-sales-trend', `dashboard-sales-trend-${rangeToUse}`]
        }
      )
      trendData = await cachedFetchTrend()
    } else {
      // No caching for "today" or custom date ranges - fetch fresh data
      trendData = await fetchSalesTrendInternal({
      days,
        dateRange: rangeToUse,
        regionCode,
        cityCode,
        teamLeaderCode,
        fieldUserRole,
        userCode,
        chainName,
        storeCode,
        customStartDate,
        customEndDate
      })
    }

    return NextResponse.json({
      success: true,
      ...trendData,
      currentDate: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      cached: shouldCache,
      cacheInfo: {
        duration: shouldCache ? cacheDuration : 0,
        dateRange: rangeToUse,
        hasCustomDates,
        reason: shouldCache ? undefined : (rangeToUse === 'today' ? 'today' : 'custom-range')
      },
      source: 'postgresql-flat-table'
    }, {
      headers: {
        'Cache-Control': shouldCache
          ? getCacheControlHeader(cacheDuration)
          : 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('Sales trend API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch sales trend data',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}
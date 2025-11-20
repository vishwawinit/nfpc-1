import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { unstable_cache } from 'next/cache'
import { shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader, getCacheDuration } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
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
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
  }

  return {
    startDate,
    endDate
  }
}

// Internal function to fetch KPI data (will be cached)
async function fetchKPIDataInternal(params: {
  dateRange: string
  regionCode: string | null
  cityCode: string | null
  fieldUserRole: string | null
  teamLeaderCode: string | null
  userCode: string | null
  chainName: string | null
  storeCode: string | null
  customStartDate: string | null
  customEndDate: string | null
}) {
  const { query } = await import('@/lib/database')
  const {
    dateRange,
    regionCode,
    cityCode,
    fieldUserRole,
    teamLeaderCode,
    userCode,
    chainName,
    storeCode,
    customStartDate,
    customEndDate
  } = params

    // Get the actual current date
    const currentDate = new Date()

    // Get date range - prioritize custom dates if provided
    let startDate: Date, endDate: Date
    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
    } else {
      const dateRangeResult = getDateRangeFromString(dateRange)
      startDate = dateRangeResult.startDate
      endDate = dateRangeResult.endDate
    }

    // Build filter conditions
    const conditions: string[] = []
  const queryParams: any[] = []
    let paramIndex = 1

  // Date conditions - optimized for index usage (no DATE() function)
    conditions.push(`t.transaction_date >= $${paramIndex}::date`)
  queryParams.push(startDate.toISOString().split('T')[0])
    paramIndex++
    conditions.push(`t.transaction_date < ($${paramIndex}::date + INTERVAL '1 day')`)
  queryParams.push(endDate.toISOString().split('T')[0])
    paramIndex++
    
  // Region filter
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

  // Team Leader filter
    if (teamLeaderCode) {
      conditions.push(`c.sales_person_code = $${paramIndex}`)
    queryParams.push(teamLeaderCode)
      paramIndex++
    }

  // Field User Role filter
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

    // Filter out NULL order_total
    conditions.push(`t.order_total IS NOT NULL`)

    // Check if we need customer master join (only if filters require it)
    const needsCustomerJoin = !!(regionCode || cityCode || teamLeaderCode || fieldUserRole || chainName)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Optimized single-pass KPI query - using order_total for transaction amounts
  // Conditional JOIN only when needed for better performance
    const buildOptimizedKPIQuery = (clause: string, needsJoin: boolean) => `
      SELECT
        COALESCE(SUM(CASE WHEN t.order_total >= 0 THEN t.order_total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN t.order_total < 0 THEN ABS(t.order_total) ELSE 0 END), 0) as return_sales,
        COALESCE(SUM(t.order_total), 0) as net_sales,
        COUNT(DISTINCT CASE WHEN t.order_total >= 0 THEN t.transaction_code END) as total_orders,
        COUNT(DISTINCT CASE WHEN t.order_total < 0 THEN t.transaction_code END) as return_orders,
        COUNT(DISTINCT t.customer_code) as unique_customers,
        COALESCE(SUM(CASE WHEN t.order_total >= 0 THEN COALESCE(t.quantity_bu, 0) ELSE 0 END), 0) as total_quantity,
        COALESCE(MAX(t.currency_code), 'AED') as currency_code,
        COUNT(*) as total_records
      FROM flat_transactions t
      ${needsJoin ? `LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code` : ''}
      ${clause}
    `
    
  // Execute current period query
  const currentResult = await query(buildOptimizedKPIQuery(whereClause, needsCustomerJoin), queryParams)
    const current = currentResult.rows[0] || {}
    
    const currentTotalSales = parseFloat(current.total_sales || '0')
    const currentReturnSales = parseFloat(current.return_sales || '0')
    const currentNetSales = parseFloat(current.net_sales || '0')
    const currentTotalOrders = parseInt(current.total_orders || '0')
    const currentReturnOrders = parseInt(current.return_orders || '0')
    const currentNetOrders = currentTotalOrders - currentReturnOrders
    const currentUniqueCustomers = parseInt(current.unique_customers || '0')
    const currentTotalUnits = parseFloat(current.total_quantity || '0')
    const currentCurrencyCode = current.currency_code || 'AED'
    const currentAvgOrder = currentNetOrders > 0 ? currentNetSales / currentNetOrders : 0
    const totalRecords = parseInt(current.total_records || '0')
    
  // Previous period stats
    const periodLength = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const prevStartDate = new Date(startDate)
    prevStartDate.setDate(prevStartDate.getDate() - periodLength)
    const prevEndDate = new Date(startDate)
    prevEndDate.setDate(prevEndDate.getDate() - 1)

    const prevConditions: string[] = []
    const prevParams: any[] = []
    let prevParamIndex = 1

    // Previous period date conditions - optimized for index usage
    prevConditions.push(`t.transaction_date >= $${prevParamIndex}::date`)
    prevParams.push(prevStartDate.toISOString().split('T')[0])
    prevParamIndex++
    prevConditions.push(`t.transaction_date < ($${prevParamIndex}::date + INTERVAL '1 day')`)
    prevParams.push(prevEndDate.toISOString().split('T')[0])
    prevParamIndex++

  if (regionCode) { prevConditions.push(`c.state = $${prevParamIndex}`); prevParams.push(regionCode); prevParamIndex++ }
  if (cityCode) { prevConditions.push(`c.city = $${prevParamIndex}`); prevParams.push(cityCode); prevParamIndex++ }
  if (teamLeaderCode) { prevConditions.push(`c.sales_person_code = $${prevParamIndex}`); prevParams.push(teamLeaderCode); prevParamIndex++ }
  if (fieldUserRole) { prevConditions.push(`c.sales_person_code = $${prevParamIndex}`); prevParams.push(fieldUserRole); prevParamIndex++ }
  if (userCode) { prevConditions.push(`t.user_code = $${prevParamIndex}`); prevParams.push(userCode); prevParamIndex++ }
  if (chainName) { prevConditions.push(`c.customer_type = $${prevParamIndex}`); prevParams.push(chainName); prevParamIndex++ }
  if (storeCode) { prevConditions.push(`t.customer_code = $${prevParamIndex}`); prevParams.push(storeCode); prevParamIndex++ }
  
  // Add order_total filter
  prevConditions.push(`t.order_total IS NOT NULL`)

    const prevWhereClause = `WHERE ${prevConditions.join(' AND ')}`
    const prevNeedsJoin = !!(regionCode || cityCode || teamLeaderCode || fieldUserRole || chainName)
    const prevResult = await query(buildOptimizedKPIQuery(prevWhereClause, prevNeedsJoin), prevParams)

    const prev = prevResult.rows[0] || {}
    const prevTotalSales = parseFloat(prev.total_sales || '0')
    const prevReturnSales = parseFloat(prev.return_sales || '0')
    const prevNetSales = parseFloat(prev.net_sales || '0')
    const prevTotalOrders = parseInt(prev.total_orders || '0')
    const prevReturnOrders = parseInt(prev.return_orders || '0')
    const prevNetOrders = prevTotalOrders - prevReturnOrders
    const prevUniqueCustomers = parseInt(prev.unique_customers || '0')
    const prevTotalUnits = parseFloat(prev.total_quantity || '0')

    // Calculate changes
    const netSalesChange = prevNetSales > 0 ? ((currentNetSales - prevNetSales) / prevNetSales * 100) : 0
    const netOrdersChange = prevNetOrders > 0 ? ((currentNetOrders - prevNetOrders) / prevNetOrders * 100) : 0
    const uniqueCustomersChange = prevUniqueCustomers > 0 ? ((currentUniqueCustomers - prevUniqueCustomers) / prevUniqueCustomers * 100) : 0
    const unitsChange = prevTotalUnits > 0 ? ((currentTotalUnits - prevTotalUnits) / prevTotalUnits * 100) : 0
    const prevAvgOrder = prevNetOrders > 0 ? prevNetSales / prevNetOrders : 0
    const avgOrderChange = prevAvgOrder > 0 ? ((currentAvgOrder - prevAvgOrder) / prevAvgOrder * 100) : 0

  // MTD calculations - optimized for index usage
    const mtdStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const mtdConditions = [`t.transaction_date >= $1::date`, `t.transaction_date < ($2::date + INTERVAL '1 day')`]
    const mtdParams = [mtdStartDate.toISOString().split('T')[0], currentDate.toISOString().split('T')[0]]
    let mtdParamIndex = 3
    
    if (regionCode) { mtdConditions.push(`c.state = $${mtdParamIndex}`); mtdParams.push(regionCode); mtdParamIndex++ }
    if (cityCode) { mtdConditions.push(`c.city = $${mtdParamIndex}`); mtdParams.push(cityCode); mtdParamIndex++ }
    if (teamLeaderCode) { mtdConditions.push(`c.sales_person_code = $${mtdParamIndex}`); mtdParams.push(teamLeaderCode); mtdParamIndex++ }
    if (fieldUserRole) { mtdConditions.push(`c.sales_person_code = $${mtdParamIndex}`); mtdParams.push(fieldUserRole); mtdParamIndex++ }
    if (userCode) { mtdConditions.push(`t.user_code = $${mtdParamIndex}`); mtdParams.push(userCode); mtdParamIndex++ }
    if (chainName) { mtdConditions.push(`c.customer_type = $${mtdParamIndex}`); mtdParams.push(chainName); mtdParamIndex++ }
    if (storeCode) { mtdConditions.push(`t.customer_code = $${mtdParamIndex}`); mtdParams.push(storeCode); mtdParamIndex++ }
    
    // Add order_total filter
    mtdConditions.push(`t.order_total IS NOT NULL`)

    const mtdWhereClause = `WHERE ${mtdConditions.join(' AND ')}`
    const mtdNeedsJoin = !!(regionCode || cityCode || teamLeaderCode || fieldUserRole || chainName)
    const mtdResult = await query(buildOptimizedKPIQuery(mtdWhereClause, mtdNeedsJoin), mtdParams)
  const mtdSales = parseFloat(mtdResult.rows[0]?.net_sales || '0')

  // YTD calculations - optimized for index usage
    const ytdStartDate = new Date(currentDate.getFullYear(), 0, 1)
    const ytdConditions = [`t.transaction_date >= $1::date`, `t.transaction_date < ($2::date + INTERVAL '1 day')`]
    const ytdParams = [ytdStartDate.toISOString().split('T')[0], currentDate.toISOString().split('T')[0]]
    let ytdParamIndex = 3
    
    if (regionCode) { ytdConditions.push(`c.state = $${ytdParamIndex}`); ytdParams.push(regionCode); ytdParamIndex++ }
    if (cityCode) { ytdConditions.push(`c.city = $${ytdParamIndex}`); ytdParams.push(cityCode); ytdParamIndex++ }
    if (teamLeaderCode) { ytdConditions.push(`c.sales_person_code = $${ytdParamIndex}`); ytdParams.push(teamLeaderCode); ytdParamIndex++ }
    if (fieldUserRole) { ytdConditions.push(`c.sales_person_code = $${ytdParamIndex}`); ytdParams.push(fieldUserRole); ytdParamIndex++ }
    if (userCode) { ytdConditions.push(`t.user_code = $${ytdParamIndex}`); ytdParams.push(userCode); ytdParamIndex++ }
    if (chainName) { ytdConditions.push(`c.customer_type = $${ytdParamIndex}`); ytdParams.push(chainName); ytdParamIndex++ }
    if (storeCode) { ytdConditions.push(`t.customer_code = $${ytdParamIndex}`); ytdParams.push(storeCode); ytdParamIndex++ }
    
    // Add order_total filter
    ytdConditions.push(`t.order_total IS NOT NULL`)

    const ytdWhereClause = `WHERE ${ytdConditions.join(' AND ')}`
    const ytdNeedsJoin = !!(regionCode || cityCode || teamLeaderCode || fieldUserRole || chainName)
    const ytdResult = await query(buildOptimizedKPIQuery(ytdWhereClause, ytdNeedsJoin), ytdParams)
  const ytdSales = parseFloat(ytdResult.rows[0]?.net_sales || '0')

  return {
      currentTotalSales,
      currentReturnSales,
      currentNetSales,
    currentSales: currentNetSales,
      currentTotalOrders,
      currentReturnOrders,
      currentNetOrders,
    currentOrders: currentNetOrders,
      currentUniqueCustomers,
    currentCustomers: currentUniqueCustomers,
      currentTotalUnits,
    currentUnits: currentTotalUnits,
      prevTotalSales,
      prevReturnSales,
      prevNetSales,
      prevTotalOrders,
      prevReturnOrders,
      prevNetOrders,
      prevUniqueCustomers,
      prevTotalUnits,
      averageOrderValue: currentAvgOrder,
    avgOrderChange,
      netSalesChange,
      netOrdersChange,
      uniqueCustomersChange,
      unitsChange,
      todayOrders: currentNetOrders,
      todayCustomers: currentUniqueCustomers,
      todayUnits: currentTotalUnits,
    todaySales: currentNetSales,
      growthPercentage: netSalesChange,
      salesChange: netSalesChange,
      ordersChange: netOrdersChange,
      customersChange: uniqueCustomersChange,
      conversionRate: currentUniqueCustomers > 0 ? (currentNetOrders / currentUniqueCustomers * 100) : 0,
      mtdSales,
      ytdSales,
      currencyCode: currentCurrencyCode,
      currencySymbol: 'AED',
      debug: {
        totalRecords,
        dateRange,
        appliedFilters: {
          regionCode,
          cityCode,
          teamLeaderCode,
          fieldUserRole,
          userCode,
          chainName,
          storeCode
        }
      }
    }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'
    
    // Get filter parameters
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('city') || searchParams.get('cityCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')

    // Check if we should cache
    const shouldCache = shouldCacheFilters(dateRange, customStartDate, customEndDate)
    
    const filterParams = {
      dateRange,
      regionCode,
      cityCode,
      fieldUserRole,
      teamLeaderCode,
      userCode,
      chainName,
      storeCode,
      customStartDate,
      customEndDate
    }

    let kpiData
    if (shouldCache) {
      // Create cache key
      const cacheKey = generateFilterCacheKey('dashboard-kpi', filterParams)
      
      // Fetch with caching
      const cachedFetchKPI = unstable_cache(
        async () => fetchKPIDataInternal(filterParams),
        [cacheKey],
        {
          revalidate: getCacheDuration(dateRange, !!(customStartDate && customEndDate)),
          tags: ['dashboard-kpi']
        }
      )
      kpiData = await cachedFetchKPI()
    } else {
      // No caching - execute directly
      kpiData = await fetchKPIDataInternal(filterParams)
    }

    const hasCustomDates = !!(customStartDate && customEndDate)
    const cacheDuration = getCacheDuration(dateRange, hasCustomDates)

    return NextResponse.json({ 
      success: true, 
      data: kpiData, 
      cached: shouldCache,
      timestamp: new Date().toISOString(),
      source: 'postgresql-flat-table'
    }, {
      headers: {
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(cacheDuration)
          : 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('KPI API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard KPIs',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

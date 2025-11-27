import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

// Helper to convert Date to YYYY-MM-DD string in local timezone
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Date range helper
function getDateRange(rangeStr: string) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  let startDate: Date, endDate: Date

  switch (rangeStr) {
    case 'today':
      startDate = new Date(year, month, day)
      endDate = new Date(year, month, day)
      break
    case 'yesterday':
      startDate = new Date(year, month, day - 1)
      endDate = new Date(year, month, day - 1)
      break
    case 'thisWeek':
      startDate = new Date(year, month, day - 6)
      endDate = new Date(year, month, day)
      break
    case 'thisMonth':
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastMonth':
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(month / 3)
      startDate = new Date(year, quarter * 3, 1)
      endDate = new Date(year, month, day)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(month / 3) - 1
      startDate = new Date(year, lastQuarter * 3, 1)
      endDate = new Date(year, lastQuarter * 3 + 3, 0)
      break
    default:
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month, day)
  }

  return {
    startStr: toLocalDateString(startDate),
    endStr: toLocalDateString(endDate),
    label: rangeStr
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    // Get date range
    let startStr: string, endStr: string
    if (startDateParam && endDateParam) {
      startStr = startDateParam
      endStr = endDateParam
    } else {
      const dateResult = getDateRange(range)
      startStr = dateResult.startStr
      endStr = dateResult.endStr
    }

    // Build WHERE clause with date range and sales filter
    const whereClause = `
      WHERE trx_trxdate >= '${startStr}'::timestamp
      AND trx_trxdate < ('${endStr}'::timestamp + INTERVAL '1 day')
      AND trx_trxtype = 1
    `

    console.log('🔍 Fetching filters for date range:', { startStr, endStr })

    // Get distinct customers
    const customersQuery = `
      SELECT
        customer_code as value,
        customer_code || ' - ' || COALESCE(MAX(customer_description), customer_code) as label,
        COUNT(DISTINCT trx_trxcode) as count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND customer_code IS NOT NULL
      GROUP BY customer_code
      ORDER BY count DESC
      LIMIT 100
    `

    // Get distinct regions (route_areacode)
    const regionsQuery = `
      SELECT DISTINCT
        route_areacode as value,
        route_areacode as label,
        COUNT(DISTINCT customer_code) as count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND route_areacode IS NOT NULL
      AND route_areacode != ''
      GROUP BY route_areacode
      ORDER BY value
    `

    // Get distinct cities (route_subareacode)
    const citiesQuery = `
      SELECT DISTINCT
        route_subareacode as value,
        route_subareacode as label,
        COUNT(DISTINCT customer_code) as count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND route_subareacode IS NOT NULL
      AND route_subareacode != ''
      GROUP BY route_subareacode
      ORDER BY value
    `

    // Get distinct chains (customer_channel_description)
    const chainsQuery = `
      SELECT DISTINCT
        customer_channel_description as value,
        customer_channel_description as label,
        COUNT(DISTINCT customer_code) as count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND customer_channel_description IS NOT NULL
      AND customer_channel_description != ''
      GROUP BY customer_channel_description
      ORDER BY value
    `

    // Get distinct salesmen (trx_usercode)
    const salesmenQuery = `
      SELECT DISTINCT
        trx_usercode as value,
        trx_usercode || ' - ' || trx_usercode as label,
        COUNT(DISTINCT customer_code) as count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND trx_usercode IS NOT NULL
      AND trx_usercode != ''
      GROUP BY trx_usercode
      ORDER BY value
    `

    // Get distinct team leaders (route_salesmancode)
    const teamLeadersQuery = `
      SELECT DISTINCT
        route_salesmancode as value,
        route_salesmancode || ' - ' || route_salesmancode as label,
        COUNT(DISTINCT trx_usercode) as salesman_count
      FROM ${SALES_TABLE}
      ${whereClause}
      AND route_salesmancode IS NOT NULL
      AND route_salesmancode != ''
      GROUP BY route_salesmancode
      ORDER BY value
    `

    // Get distinct product categories (item_grouplevel1)
    const categoriesQuery = `
      SELECT
        COALESCE(item_grouplevel1, 'Others') as value,
        COALESCE(item_grouplevel1, 'Others') as label,
        COUNT(DISTINCT line_itemcode) as product_count,
        COUNT(DISTINCT customer_code) as customer_count
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY item_grouplevel1
      ORDER BY product_count DESC
    `

    // Execute all queries in parallel
    const [customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult] = await Promise.all([
      query(customersQuery).catch(e => { console.error('Customers query error:', e); return { rows: [] } }),
      query(regionsQuery).catch(e => { console.error('Regions query error:', e); return { rows: [] } }),
      query(citiesQuery).catch(e => { console.error('Cities query error:', e); return { rows: [] } }),
      query(chainsQuery).catch(e => { console.error('Chains query error:', e); return { rows: [] } }),
      query(salesmenQuery).catch(e => { console.error('Salesmen query error:', e); return { rows: [] } }),
      query(teamLeadersQuery).catch(e => { console.error('Team leaders query error:', e); return { rows: [] } }),
      query(categoriesQuery).catch(e => { console.error('Categories query error:', e); return { rows: [] } })
    ])

    const filterData = {
      customers: customersResult.rows || [],
      regions: regionsResult.rows || [],
      cities: citiesResult.rows || [],
      chains: chainsResult.rows || [],
      salesmen: salesmenResult.rows || [],
      teamLeaders: teamLeadersResult.rows || [],
      productCategories: categoriesResult.rows || []
    }

    console.log('✅ Filters loaded:', {
      customers: filterData.customers.length,
      regions: filterData.regions.length,
      cities: filterData.cities.length,
      chains: filterData.chains.length,
      salesmen: filterData.salesmen.length,
      teamLeaders: filterData.teamLeaders.length,
      categories: filterData.productCategories.length
    })

    return NextResponse.json({
      success: true,
      filters: filterData,
      dateRange: {
        start: startStr,
        end: endStr,
        label: range
      },
      cached: false,
      cacheInfo: {
        duration: 0,
        reason: range === 'today' ? 'today' : 'custom-range'
      }
    }, {
      headers: {
        'Cache-Control': range === 'today'
          ? 'no-cache, no-store, must-revalidate'
          : 'public, s-maxage=900, stale-while-revalidate=1800'
      }
    })

  } catch (error) {
    console.error('❌ Customer filters V3 API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}


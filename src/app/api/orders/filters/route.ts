import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Filters cache for 15 minutes
const FILTERS_CACHE_DURATION = 900

function getDateRange(rangeStr: string) {
  const now = new Date()
  let startDate: Date, endDate: Date

  switch (rangeStr) {
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

export async function GET(request: NextRequest) {
  try {
    await db.initialize()

    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const loginUserCode = searchParams.get('loginUserCode')

    // Get hierarchy-based allowed users
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
    }

    let startDate: string, endDate: string

    if (startDateParam && endDateParam) {
      startDate = startDateParam
      endDate = endDateParam
    } else {
      const dateResult = getDateRange(range)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
    }

    // Build WHERE clause
    let whereConditions = [
      `t."TrxType" = 1`,
      `DATE(t."TrxDate") >= '${startDate}'`,
      `DATE(t."TrxDate") <= '${endDate}'`
    ]

    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      whereConditions.push(`t."UserCode" IN (${userCodesStr})`)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Get distinct regions
    const regionsQuery = `
      SELECT
        c."RegionCode" as value,
        COALESCE(reg."Description", c."RegionCode") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblRegion" reg ON c."RegionCode" = reg."Code"
      ${whereClause}
        AND c."RegionCode" IS NOT NULL
        AND c."RegionCode" != ''
      GROUP BY c."RegionCode", reg."Description"
      ORDER BY label
    `

    // Get distinct cities
    const citiesQuery = `
      SELECT
        c."CityCode" as value,
        COALESCE(city."Description", c."CityCode") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblCity" city ON c."CityCode" = city."Code"
      ${whereClause}
        AND c."CityCode" IS NOT NULL
        AND c."CityCode" != ''
      GROUP BY c."CityCode", city."Description"
      ORDER BY label
    `

    // Get distinct chains
    const chainsQuery = `
      SELECT
        c."JDECustomerType" as value,
        COALESCE(chn."Description", c."JDECustomerType") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblChannel" chn ON c."JDECustomerType" = chn."Code"
      ${whereClause}
        AND c."JDECustomerType" IS NOT NULL
        AND c."JDECustomerType" != ''
      GROUP BY c."JDECustomerType", chn."Description"
      ORDER BY label
    `

    // Get distinct customers
    const customersQuery = `
      SELECT
        t."ClientCode" as value,
        COALESCE(c."Description", t."ClientCode") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      ${whereClause}
        AND t."ClientCode" IS NOT NULL
        AND t."ClientCode" != ''
      GROUP BY t."ClientCode", c."Description"
      ORDER BY count DESC
      LIMIT 100
    `

    // Get distinct salesmen
    const salesmenQuery = `
      SELECT
        t."UserCode" as value,
        COALESCE(u."Description", t."UserCode") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      ${whereClause}
        AND t."UserCode" IS NOT NULL
        AND t."UserCode" != ''
      GROUP BY t."UserCode", u."Description"
      ORDER BY label
    `

    // Get distinct team leaders
    const teamLeadersQuery = `
      SELECT
        c."SalesmanCode" as value,
        COALESCE(u."Description", c."SalesmanCode") as label,
        COUNT(DISTINCT t."TrxCode") as count
      FROM "tblTrxHeader" t
      LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
      LEFT JOIN "tblUser" u ON c."SalesmanCode" = u."Code"
      ${whereClause}
        AND c."SalesmanCode" IS NOT NULL
        AND c."SalesmanCode" != ''
      GROUP BY c."SalesmanCode", u."Description"
      ORDER BY label
    `

    // Execute all queries (skip product categories since tblProduct doesn't exist)
    const [
      regionsResult,
      citiesResult,
      chainsResult,
      customersResult,
      salesmenResult,
      teamLeadersResult
    ] = await Promise.all([
      query(regionsQuery, []),
      query(citiesQuery, []),
      query(chainsQuery, []),
      query(customersQuery, []),
      query(salesmenQuery, []),
      query(teamLeadersQuery, [])
    ])

    console.log('Orders Filters - Response counts:', {
      regions: regionsResult.rows.length,
      cities: citiesResult.rows.length,
      chains: chainsResult.rows.length,
      customers: customersResult.rows.length,
      salesmen: salesmenResult.rows.length,
      teamLeaders: teamLeadersResult.rows.length
    })

    return NextResponse.json({
      success: true,
      filters: {
        regions: regionsResult.rows || [],
        cities: citiesResult.rows || [],
        chains: chainsResult.rows || [],
        customers: customersResult.rows || [],
        salesmen: salesmenResult.rows || [],
        teamLeaders: teamLeadersResult.rows || [],
        productCategories: [] // Empty since tblProduct doesn't exist
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: range
      },
      cached: true,
      cacheInfo: {
        duration: FILTERS_CACHE_DURATION
      }
    }, {
      headers: {
        'Cache-Control': `public, s-maxage=${FILTERS_CACHE_DURATION}, stale-while-revalidate=${FILTERS_CACHE_DURATION * 2}`
      }
    })

  } catch (error) {
    console.error('Orders filters API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'
import { resolveTransactionsTable } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Filters cache for 15 minutes - they don't change frequently
const FILTERS_CACHE_DURATION = 900 // 15 minutes

// Helper to get column-safe expressions for filters
function getFilterColumnExpressions(columns: Set<string>) {
  const has = (column: string) => columns.has(column)

  return {
    storeCode: has('store_code') ? 'store_code' : 'customer_code',
    storeName: has('store_name') ? 'store_name' : 'NULL',
    regionCode: has('region_code') ? 'region_code' : 'NULL',
    regionName: has('region_name') ? 'region_name' : 'NULL',
    cityCode: has('city_code') ? 'city_code' : 'NULL',
    cityName: has('city_name') ? 'city_name' : 'NULL',
    chainCode: has('chain_code') ? 'chain_code' : 'NULL',
    chainName: has('chain_name') ? 'chain_name' : 'NULL',
    tlCode: has('tl_code') ? 'tl_code' : 'NULL',
    tlName: has('tl_name') ? 'tl_name' : 'NULL',
    fieldUserCode: has('field_user_code')
      ? 'field_user_code'
      : has('user_code')
        ? 'user_code'
        : 'NULL',
    fieldUserName: has('field_user_name') ? 'field_user_name' : 'NULL',
    trxCode: has('trx_code') ? 'trx_code' : 'transaction_code',
    trxDateOnly: has('trx_date_only') ? 'trx_date_only' : 'DATE(transaction_date)',
    trxType: has('trx_type') ? 'trx_type' : has('transaction_type') ? 'transaction_type' : '5',
    productGroup: has('product_group_level1') ? 'product_group_level1' : has('product_group') ? 'product_group' : 'NULL',
    productCode: has('product_code') ? 'product_code' : 'NULL'
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const loginUserCode = searchParams.get('loginUserCode')
    
    await db.initialize()
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getFilterColumnExpressions(tableInfo.columns)
    
    // Get hierarchy-based allowed users
    let allowedUserCodes: string[] = []
    let userIsTeamLeader = false
    let allowedTeamLeaders: string[] = []
    let allowedFieldUsers: string[] = []
    
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
      
      // Query to determine which of the allowed users are Team Leaders vs Field Users
      if (allowedUserCodes.length > 0) {
        const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
        
        // Get team leaders from the allowed codes
        const tlResult = await query(`
          SELECT DISTINCT ${col.tlCode} as tl_code
          FROM ${transactionsTable}
          WHERE ${col.tlCode} IN (${userCodesStr})
          AND ${col.trxType} = 5
        `, [])
        allowedTeamLeaders = tlResult.rows.map(r => r.tl_code).filter(Boolean)
        
        // Check if the logged-in user is a team leader
        userIsTeamLeader = allowedTeamLeaders.includes(loginUserCode)
        
        // If user is a TL, only they should appear in TL filter
        if (userIsTeamLeader) {
          allowedTeamLeaders = [loginUserCode]
        }
        
        // Field users are all allowed codes
        allowedFieldUsers = allowedUserCodes
      }
    }
    
    // Get date range
    const current = new Date()
    let startDate: Date, endDate: Date
    
    // Check for custom date range first
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)
    } else {
      switch (range) {
      case 'today':
        startDate = new Date(current.setHours(0, 0, 0, 0))
        endDate = new Date(current.setHours(23, 59, 59, 999))
        break
      case 'yesterday':
        const yesterday = new Date(current)
        yesterday.setDate(yesterday.getDate() - 1)
        startDate = new Date(yesterday.setHours(0, 0, 0, 0))
        endDate = new Date(yesterday.setHours(23, 59, 59, 999))
        break
      case 'thisWeek':
        const weekStart = new Date(current)
        weekStart.setDate(current.getDate() - current.getDay())
        startDate = new Date(weekStart.setHours(0, 0, 0, 0))
        endDate = new Date(current)
        break
      case 'thisMonth':
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        endDate = new Date(current)
        break
      case 'lastMonth':
        startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        endDate = new Date(current.getFullYear(), current.getMonth(), 0)
        break
      case 'thisQuarter':
        const quarter = Math.floor(current.getMonth() / 3)
        startDate = new Date(current.getFullYear(), quarter * 3, 1)
        endDate = new Date(current)
        break
      case 'lastQuarter':
        const lastQuarter = Math.floor(current.getMonth() / 3) - 1
        startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
        endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
        break
      default:
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        endDate = new Date(current)
      }
    }

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    // Build WHERE clause with hierarchy filtering
    let whereClause = `
      WHERE ${col.trxType} = 5 
      AND ${col.trxDateOnly} >= '${startStr}'
      AND ${col.trxDateOnly} <= '${endStr}'
    `
    
    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      whereClause += ` AND ${col.fieldUserCode} IN (${userCodesStr})`
    }

    // Get distinct customers
    const customersQuery = `
      SELECT
        ${col.storeCode} as value,
        ${col.storeCode} || ' - ' || COALESCE(${col.storeName}, 'Unknown') as label,
        COUNT(DISTINCT ${col.trxCode}) as count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.storeCode} IS NOT NULL
      GROUP BY ${col.storeCode}, ${col.storeName}
      ORDER BY count DESC
      LIMIT 100
    `

    // Get distinct regions
    const regionsQuery = `
      SELECT
        ${col.regionCode} as value,
        ${col.regionCode} || ' - ' || COALESCE(${col.regionName}, 'Unknown') as label,
        COUNT(DISTINCT ${col.storeCode}) as count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.regionCode} IS NOT NULL
      GROUP BY ${col.regionCode}, ${col.regionName}
      ORDER BY ${col.regionCode}
    `

    // Get distinct cities
    const citiesQuery = `
      SELECT
        ${col.cityCode} as value,
        ${col.cityCode} || ' - ' || COALESCE(${col.cityName}, 'Unknown') as label,
        COUNT(DISTINCT ${col.storeCode}) as count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.cityCode} IS NOT NULL
      GROUP BY ${col.cityCode}, ${col.cityName}
      ORDER BY ${col.cityCode}
    `

    // Get distinct chains
    const chainsQuery = `
      SELECT
        ${col.chainCode} as value,
        COALESCE(${col.chainName}, 'Unknown Chain') as label,
        COUNT(DISTINCT ${col.storeCode}) as count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.chainCode} IS NOT NULL
      GROUP BY ${col.chainCode}, ${col.chainName}
      ORDER BY ${col.chainName}
    `

    // Get distinct salesmen (filtered by hierarchy)
    const salesmenQuery = `
      SELECT
        ${col.fieldUserCode} as value,
        ${col.fieldUserCode} || ' - ' || COALESCE(${col.fieldUserName}, 'Unknown User') as label,
        COUNT(DISTINCT ${col.storeCode}) as count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.fieldUserCode} IS NOT NULL
      ${allowedFieldUsers.length > 0 ? `AND ${col.fieldUserCode} IN (${allowedFieldUsers.map(c => `'${c}'`).join(', ')})` : ''}
      GROUP BY ${col.fieldUserCode}, ${col.fieldUserName}
      ORDER BY ${col.fieldUserCode}
    `

    // Get distinct team leaders (filtered by hierarchy)
    const teamLeadersQuery = `
      SELECT
        ${col.tlCode} as value,
        ${col.tlCode} || ' - ' || COALESCE(${col.tlName}, 'Unknown') as label,
        COUNT(DISTINCT ${col.fieldUserCode}) as salesman_count
      FROM ${transactionsTable}
      ${whereClause}
      AND ${col.tlCode} IS NOT NULL
      ${allowedTeamLeaders.length > 0 ? `AND ${col.tlCode} IN (${allowedTeamLeaders.map(c => `'${c}'`).join(', ')})` : ''}
      GROUP BY ${col.tlCode}, ${col.tlName}
      ORDER BY ${col.tlCode}
    `

    // Get distinct product categories
    const categoriesQuery = `
      SELECT
        COALESCE(${col.productGroup}, 'Others') as value,
        COALESCE(${col.productGroup}, 'Others') as label,
        COUNT(DISTINCT ${col.productCode}) as product_count,
        COUNT(DISTINCT ${col.storeCode}) as customer_count
      FROM ${transactionsTable}
      ${whereClause}
      GROUP BY ${col.productGroup}
      ORDER BY product_count DESC
    `

    // Execute all queries
    const [customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult] = await Promise.all([
      query(customersQuery, []),
      query(regionsQuery, []),
      query(citiesQuery, []),
      query(chainsQuery, []),
      query(salesmenQuery, []),
      query(teamLeadersQuery, []),
      query(categoriesQuery, [])
    ])

    return NextResponse.json({
      success: true,
      filters: {
        customers: customersResult.rows || [],
        regions: regionsResult.rows || [],
        cities: citiesResult.rows || [],
        chains: chainsResult.rows || [],
        salesmen: salesmenResult.rows || [],
        teamLeaders: teamLeadersResult.rows || [],
        productCategories: categoriesResult.rows || []
      },
      dateRange: {
        start: startStr,
        end: endStr,
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
    console.error('Customer filters V3 API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

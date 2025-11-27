import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { FILTERS_CACHE_DURATION, shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader } from '@/lib/cache-utils'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Helper to get column-safe expressions for filters
function getFilterColumnExpressions(columns: Set<string>) {
  const has = (column: string) => columns.has(column)

  // Detect if this is tblTrxHeader (has PascalCase columns)
  const isTblTrxHeader = has('TrxCode') || has('ClientCode') || has('TrxDate')

  if (isTblTrxHeader) {
    // Return quoted PascalCase columns for tblTrxHeader
    return {
      storeCode: '"ClientCode"',
      storeName: 'NULL',
      regionCode: 'NULL',
      regionName: 'NULL',
      cityCode: 'NULL',
      cityName: 'NULL',
      chainCode: 'NULL',
      chainName: 'NULL',
      tlCode: 'NULL',
      tlName: 'NULL',
      fieldUserCode: has('SalesRepCode') ? '"SalesRepCode"' : 'NULL',
      fieldUserName: 'NULL',
      trxCode: '"TrxCode"',
      trxDateOnly: 'DATE("TrxDate")',
      trxType: has('TrxType') ? '"TrxType"' : '5',
      productGroup: 'NULL',
      productCode: has('ProductCode') ? '"ProductCode"' : 'NULL',
      isTblTrxHeader: true
    }
  }

  // Return snake_case columns for flat_* tables
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
    productCode: has('product_code') ? 'product_code' : 'NULL',
    isTblTrxHeader: false
  }
}

// Helper to get customer table info based on transactions table
function getCustomerTableInfo(transactionsTable: string) {
  const isTblTrxHeader = transactionsTable === '"tblTrxHeader"'
  if (isTblTrxHeader) {
    return {
      table: '"tblCustomer"',
      joinColumn: '"Code"',
      nameColumn: '"Description"',
      stateColumn: '"RegionCode"',  // tblCustomer uses RegionCode not State
      cityColumn: '"CityCode"',     // tblCustomer uses CityCode not City
      customerTypeColumn: '"JDECustomerType"'  // tblCustomer uses JDECustomerType
    }
  }
  return {
    table: 'flat_customers_master',
    joinColumn: 'customer_code',
    nameColumn: 'customer_name',
    stateColumn: 'state',
    cityColumn: 'city',
    customerTypeColumn: 'customer_type'
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    
    await db.initialize()
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getFilterColumnExpressions(tableInfo.columns)
    const custTable = getCustomerTableInfo(transactionsTable)
    const isTblTrxHeader = col.isTblTrxHeader
        
    // Authentication removed - no hierarchy filtering
    
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
    
    // Build WHERE clause - Authentication removed
    let whereClause = ''

    // Date range filters
    const dateExpr = col.trxDateOnly.startsWith('DATE(')
      ? col.trxDateOnly
      : `t.${col.trxDateOnly}`

    whereClause = `WHERE ${dateExpr} >= '${startStr}' AND ${dateExpr} <= '${endStr}'`

    // Only add trx_type filter for sales transactions (type = 1) if column exists
    if (col.trxType !== '5' && isTblTrxHeader) {
      whereClause += ` AND t.${col.trxType} = 1`
    }

    // Get distinct customers
    const customerNameExpr = isTblTrxHeader
      ? `COALESCE(c.${custTable.nameColumn}, 'Unknown')`
      : (col.storeName === 'NULL' ? `COALESCE(c.${custTable.nameColumn}, 'Unknown')` : `COALESCE(t.${col.storeName}, c.${custTable.nameColumn}, 'Unknown')`)
    const customersQuery = `
      SELECT
        t.${col.storeCode} as value,
        t.${col.storeCode} || ' - ' || ${customerNameExpr} as label,
        COUNT(DISTINCT t.${col.trxCode}) as count
      FROM ${transactionsTable} t
      LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
      ${whereClause}
      AND t.${col.storeCode} IS NOT NULL
      GROUP BY t.${col.storeCode}, ${customerNameExpr}
      ORDER BY count DESC
      LIMIT 100
    `

    // Get distinct regions
    let regionsQuery: string
    if (isTblTrxHeader) {
      // For tblTrxHeader, get region codes and optionally join names
      regionsQuery = `
        SELECT
          c.${custTable.stateColumn} as value,
          MAX(COALESCE(reg."Description", c.${custTable.stateColumn})) as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        LEFT JOIN "tblRegion" reg ON c.${custTable.stateColumn} = reg."Code"
        ${whereClause}
        AND c.${custTable.stateColumn} IS NOT NULL
        AND c.${custTable.stateColumn} != ''
        GROUP BY c.${custTable.stateColumn}
        ORDER BY label
      `
    } else {
      const regionCol = col.regionCode === 'NULL' ? `c.${custTable.stateColumn}` : `COALESCE(c.${custTable.stateColumn}, t.${col.regionCode})`
      regionsQuery = `
        SELECT DISTINCT
          ${regionCol} as value,
          ${regionCol} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        ${whereClause}
        AND ${regionCol} IS NOT NULL
        AND ${regionCol} != ''
        GROUP BY ${regionCol}
        ORDER BY value
      `
    }

    // Get distinct cities
    let citiesQuery: string
    if (isTblTrxHeader) {
      // For tblTrxHeader, get city codes and optionally join names
      citiesQuery = `
        SELECT
          c.${custTable.cityColumn} as value,
          MAX(COALESCE(city."Description", c.${custTable.cityColumn})) as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        LEFT JOIN "tblCity" city ON c.${custTable.cityColumn} = city."Code"
        ${whereClause}
        AND c.${custTable.cityColumn} IS NOT NULL
        AND c.${custTable.cityColumn} != ''
        GROUP BY c.${custTable.cityColumn}
        ORDER BY label
      `
    } else {
      const cityCol = col.cityCode === 'NULL' ? `c.${custTable.cityColumn}` : `COALESCE(c.${custTable.cityColumn}, t.${col.cityCode})`
      citiesQuery = `
        SELECT DISTINCT
          ${cityCol} as value,
          ${cityCol} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        ${whereClause}
        AND ${cityCol} IS NOT NULL
        AND ${cityCol} != ''
        GROUP BY ${cityCol}
        ORDER BY value
      `
    }

    // Get distinct chains/customer types
    let chainsQuery: string
    if (isTblTrxHeader) {
      // For tblTrxHeader, get chain codes and optionally join names
      chainsQuery = `
        SELECT
          c.${custTable.customerTypeColumn} as value,
          MAX(COALESCE(chn."Description", c.${custTable.customerTypeColumn})) as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        LEFT JOIN "tblChannel" chn ON c.${custTable.customerTypeColumn} = chn."Code"
        ${whereClause}
        AND c.${custTable.customerTypeColumn} IS NOT NULL
        AND c.${custTable.customerTypeColumn} != ''
        GROUP BY c.${custTable.customerTypeColumn}
        ORDER BY label
      `
    } else {
      chainsQuery = `
        SELECT DISTINCT
          c.${custTable.customerTypeColumn} as value,
          c.${custTable.customerTypeColumn} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
        ${whereClause}
        AND c.${custTable.customerTypeColumn} IS NOT NULL
        AND c.${custTable.customerTypeColumn} != ''
        GROUP BY c.${custTable.customerTypeColumn}
        ORDER BY value
      `
    }

    // Get distinct salesmen - Handle NULL columns properly
    let salesmenQuery = ''
    if (col.fieldUserCode === 'NULL') {
      // If fieldUserCode doesn't exist, return empty result
      salesmenQuery = `SELECT 'N/A' as value, 'No Salesman Column' as label, 0 as count WHERE false`
    } else {
      if (isTblTrxHeader) {
        // For tblTrxHeader, join with tblUser to get user names
        salesmenQuery = `
        SELECT
          t.${col.fieldUserCode} as value,
          MAX(COALESCE(t.${col.fieldUserCode} || ' - ' || sales_user."Description", t.${col.fieldUserCode}::text)) as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        LEFT JOIN "tblUser" sales_user ON t.${col.fieldUserCode} = sales_user."Code"
        ${whereClause}
        AND t.${col.fieldUserCode} IS NOT NULL
        AND t.${col.fieldUserCode} != ''
        GROUP BY t.${col.fieldUserCode}
        ORDER BY value
        `
      } else {
        const userNameExpr = col.fieldUserName === 'NULL'
          ? `t.${col.fieldUserCode}::text`
          : `COALESCE(t.${col.fieldUserName}, t.${col.fieldUserCode}::text)`
        salesmenQuery = `
        SELECT DISTINCT
          t.${col.fieldUserCode} as value,
          t.${col.fieldUserCode} || ' - ' || ${userNameExpr} as label,
          COUNT(DISTINCT t.${col.storeCode}) as count
        FROM ${transactionsTable} t
        ${whereClause}
        AND t.${col.fieldUserCode} IS NOT NULL
        AND t.${col.fieldUserCode} != ''
        GROUP BY t.${col.fieldUserCode}, ${userNameExpr}
        ORDER BY value
        `
      }
    }

    // Get distinct team leaders - Handle NULL columns properly
    let teamLeadersQuery = ''
    if (isTblTrxHeader) {
      // For tblTrxHeader, TL is in tblCustomer.SalesmanCode
      teamLeadersQuery = `
      SELECT
        c."SalesmanCode" as value,
        MAX(COALESCE(c."SalesmanCode" || ' - ' || tl_user."Description", c."SalesmanCode")) as label,
        COUNT(DISTINCT t.${col.storeCode}) as salesman_count
      FROM ${transactionsTable} t
      LEFT JOIN ${custTable.table} c ON t.${col.storeCode} = c.${custTable.joinColumn}
      LEFT JOIN "tblUser" tl_user ON c."SalesmanCode" = tl_user."Code"
      ${whereClause}
      AND c."SalesmanCode" IS NOT NULL
      AND c."SalesmanCode" != ''
      GROUP BY c."SalesmanCode"
      ORDER BY value
      `
    } else if (col.tlCode === 'NULL') {
      // If tlCode doesn't exist, return empty result
      teamLeadersQuery = `SELECT 'N/A' as value, 'No TL Column' as label, 0 as salesman_count WHERE false`
    } else {
      const tlNameExpr = col.tlName === 'NULL'
        ? `t.${col.tlCode}::text`
        : `COALESCE(t.${col.tlName}, t.${col.tlCode}::text)`
      teamLeadersQuery = `
      SELECT DISTINCT
        t.${col.tlCode} as value,
        t.${col.tlCode} || ' - ' || ${tlNameExpr} as label,
        COUNT(DISTINCT ${col.fieldUserCode === 'NULL' ? 't.user_code' : `t.${col.fieldUserCode}`}) as salesman_count
      FROM ${transactionsTable} t
      ${whereClause}
      AND t.${col.tlCode} IS NOT NULL
      AND t.${col.tlCode} != ''
      GROUP BY t.${col.tlCode}, ${tlNameExpr}
      ORDER BY value
      `
    }

    // Get distinct product categories - Handle NULL columns properly
    // For tblTrxHeader, product details are in tblTrxDetail, not the header
    let categoriesQuery = ''
    if (isTblTrxHeader) {
      // tblTrxHeader doesn't have product info - return a single aggregate
      categoriesQuery = `
        SELECT
          'All Products' as value,
          'All Products' as label,
          0 as product_count,
          COUNT(DISTINCT t.${col.storeCode}) as customer_count
        FROM ${transactionsTable} t
        ${whereClause}
      `
    } else if (col.productGroup === 'NULL') {
      // If productGroup doesn't exist, return a single "Others" category
      categoriesQuery = `
        SELECT
          'Others' as value,
          'Others' as label,
          COUNT(DISTINCT ${col.productCode !== 'NULL' ? `t.${col.productCode}` : '1'}) as product_count,
          COUNT(DISTINCT t.${col.storeCode}) as customer_count
        FROM ${transactionsTable} t
        ${whereClause}
        GROUP BY 1
        ORDER BY product_count DESC
      `
    } else {
      const productGroupExpr = `COALESCE(t.${col.productGroup}, 'Others')`
      categoriesQuery = `
      SELECT
          ${productGroupExpr} as value,
          ${productGroupExpr} as label,
          COUNT(DISTINCT ${col.productCode !== 'NULL' ? `t.${col.productCode}` : '1'}) as product_count,
          COUNT(DISTINCT t.${col.storeCode}) as customer_count
        FROM ${transactionsTable} t
      ${whereClause}
        GROUP BY ${productGroupExpr}
      ORDER BY product_count DESC
    `
    }

    // Check if we should cache based on date range
    const shouldCache = shouldCacheFilters(range, startDateParam, endDateParam)
    
    // Create cache key
    const cacheKey = generateFilterCacheKey('customers-v3', {
      range,
      startDate: startDateParam || null,
      endDate: endDateParam || null,
      table: transactionsTable,
      startStr,
      endStr
    })

    // Internal function to fetch filters (extracted for caching)
    const fetchFiltersInternal = async () => {
      const { query } = await import('@/lib/database')

      // Use the same dynamic queries built above
      const [custRes, regRes, cityRes, chainRes, salesRes, tlRes, catRes] = await Promise.all([
        query(customersQuery, []).catch(e => { console.error('Customers query error:', e); return { rows: [] } }),
        query(regionsQuery, []).catch(e => { console.error('Regions query error:', e); return { rows: [] } }),
        query(citiesQuery, []).catch(e => { console.error('Cities query error:', e); return { rows: [] } }),
        query(chainsQuery, []).catch(e => { console.error('Chains query error:', e); return { rows: [] } }),
        query(salesmenQuery, []).catch(e => { console.error('Salesmen query error:', e); return { rows: [] } }),
        query(teamLeadersQuery, []).catch(e => { console.error('Team leaders query error:', e); return { rows: [] } }),
        query(categoriesQuery, []).catch(e => { console.error('Categories query error:', e); return { rows: [] } })
      ])

      return {
        customers: custRes.rows || [],
        regions: regRes.rows || [],
        cities: cityRes.rows || [],
        chains: chainRes.rows || [],
        salesmen: salesRes.rows || [],
        teamLeaders: tlRes.rows || [],
        productCategories: catRes.rows || []
      }
    }

    // Fetch filters with or without caching
    let filterData
    if (shouldCache) {
      // Use cached version
      const cachedFetchFilters = unstable_cache(
        fetchFiltersInternal,
        [cacheKey],
        {
          revalidate: FILTERS_CACHE_DURATION,
          tags: ['customers-filters-v3', `customers-filters-${transactionsTable}`]
        }
      )
      filterData = await cachedFetchFilters()
    } else {
      // No caching - execute queries directly (using the queries already built above)
      let customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult
      
      try {
        [customersResult, regionsResult, citiesResult, chainsResult, salesmenResult, teamLeadersResult, categoriesResult] = await Promise.all([
          query(customersQuery, []).catch(e => { console.error('Customers query error:', e); return { rows: [] } }),
          query(regionsQuery, []).catch(e => { console.error('Regions query error:', e); return { rows: [] } }),
          query(citiesQuery, []).catch(e => { console.error('Cities query error:', e); return { rows: [] } }),
          query(chainsQuery, []).catch(e => { console.error('Chains query error:', e); return { rows: [] } }),
          query(salesmenQuery, []).catch(e => { console.error('Salesmen query error:', e); return { rows: [] } }),
          query(teamLeadersQuery, []).catch(e => { console.error('Team leaders query error:', e); return { rows: [] } }),
          query(categoriesQuery, []).catch(e => { console.error('Categories query error:', e); return { rows: [] } })
        ])
      } catch (error) {
        console.error('❌ Error executing filter queries:', error)
        customersResult = { rows: [] }
        regionsResult = { rows: [] }
        citiesResult = { rows: [] }
        chainsResult = { rows: [] }
        salesmenResult = { rows: [] }
        teamLeadersResult = { rows: [] }
        categoriesResult = { rows: [] }
      }
      
      filterData = {
        customers: customersResult.rows || [],
        regions: regionsResult.rows || [],
        cities: citiesResult.rows || [],
        chains: chainsResult.rows || [],
        salesmen: salesmenResult.rows || [],
        teamLeaders: teamLeadersResult.rows || [],
        productCategories: categoriesResult.rows || []
      }
    }

    return NextResponse.json({
      success: true,
      filters: filterData,
      dateRange: {
        start: startStr,
        end: endStr,
        label: range
      },
      cached: shouldCache,
      cacheInfo: shouldCache ? {
        duration: FILTERS_CACHE_DURATION
      } : {
        duration: 0,
        reason: range === 'today' ? 'today' : 'custom-range'
      }
    }, {
      headers: {
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(FILTERS_CACHE_DURATION)
          : 'no-cache, no-store, must-revalidate'
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

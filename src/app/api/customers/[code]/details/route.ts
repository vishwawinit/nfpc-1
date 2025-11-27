import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

export const dynamic = 'force-dynamic'

/**
 * Determine customer table info based on transactions table
 */
function getCustomerTableInfo(transactionsTable: string) {
  const isTblTrxHeader = transactionsTable === '"tblTrxHeader"'

  if (isTblTrxHeader) {
    return {
      table: '"tblCustomer"',
      codeColumn: '"Code"',
      nameColumn: '"Description"',
      cityColumn: '"CityCode"',
      regionColumn: '"RegionCode"',
      typeColumn: '"JDECustomerType"',
      salesmanColumn: '"SalesmanCode"',
      salesmanNameColumn: '"SalesmanName"',
      routeColumn: '"RouteCode"',
      isTblCustomer: true
    }
  }

  return {
    table: 'flat_customers_master',
    codeColumn: 'customer_code',
    nameColumn: 'customer_name',
    cityColumn: 'city_name',
    regionColumn: 'region_name',
    typeColumn: 'customer_type',
    salesmanColumn: 'sales_person_code',
    salesmanNameColumn: 'sales_person_code',
    routeColumn: 'route_code',
    isTblCustomer: false
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    await db.initialize()

    const customerCode = params.code

    // Resolve which tables to use
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const custTable = getCustomerTableInfo(transactionsTable)

    let customerQuery: string

    if (custTable.isTblCustomer) {
      // Use tblCustomer with joins to tblTrxHeader for user/route info
      customerQuery = `
        SELECT
          c.${custTable.codeColumn} as "customerCode",
          COALESCE(c.${custTable.nameColumn}, 'Unknown') as "customerName",
          '' as "address",
          COALESCE(cd."DivisionCode", 'Unknown') as "city",
          COALESCE(cd."SalesOfficeCode", 'Unknown') as "region",
          '' as "phone",
          '' as "email",
          COALESCE(ch."Description", 'N/A') as "chain",
          'N/A' as "classification",
          true as "isActive",
          COALESCE(t."UserCode", '') as "salesmanCode",
          COALESCE(u."Description", 'Unknown') as "salesmanName",
          COALESCE(c."SalesmanCode", '') as "teamLeaderCode",
          COALESCE(c."SalesmanName", 'Unknown') as "teamLeaderName",
          COALESCE(t."RouteCode", '') as "routeCode",
          COALESCE(r."Description", t."RouteCode", 'Unknown') as "routeName"
        FROM ${custTable.table} c
        LEFT JOIN "tblTrxHeader" t ON c.${custTable.codeColumn} = t."ClientCode"
        LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
        LEFT JOIN "tblRoute" r ON t."RouteCode" = r."Code"
        LEFT JOIN "tblCustomerDetail" cd ON c.${custTable.codeColumn} = cd."CustomerCode"
        LEFT JOIN "tblChannel" ch ON TRIM(cd."ChannelCode") = TRIM(ch."Code")
        WHERE c.${custTable.codeColumn} = $1
        ORDER BY t."TrxDate" DESC NULLS LAST
        LIMIT 1
      `
    } else {
      // Use flat_customers_master
      customerQuery = `
        SELECT
          ${custTable.codeColumn} as "customerCode",
          COALESCE(${custTable.nameColumn}, 'Unknown') as "customerName",
          COALESCE(address1, '') as "address",
          COALESCE(${custTable.cityColumn}, 'Unknown') as "city",
          COALESCE(${custTable.regionColumn}, 'Unknown') as "region",
          COALESCE(contact_no1, '') as "phone",
          '' as "email",
          COALESCE(${custTable.typeColumn}, 'N/A') as "chain",
          COALESCE(classification, 'N/A') as "classification",
          COALESCE(is_active, true) as "isActive",
          COALESCE(${custTable.salesmanColumn}, '') as "salesmanCode",
          COALESCE(${custTable.salesmanNameColumn}, 'Unknown') as "salesmanName",
          '' as "routeCode"
        FROM ${custTable.table}
        WHERE ${custTable.codeColumn} = $1
        LIMIT 1
      `
    }

    const customerResult = await query(customerQuery, [customerCode])

    console.log('Customer detail query result:', JSON.stringify(customerResult.rows[0], null, 2))

    if (customerResult.rows.length === 0) {
      // If not found in customer table, try to get from transactions
      const col = getTransactionColumnExpressions(tableInfo.columns)

      let transCustomerQuery: string
      if (custTable.isTblCustomer) {
        transCustomerQuery = `
          SELECT
            t."ClientCode" as "customerCode",
            MAX(COALESCE(c."Description", 'Unknown')) as "customerName",
            '' as "address",
            MAX(COALESCE(cd."DivisionCode", 'Unknown')) as "city",
            MAX(COALESCE(cd."SalesOfficeCode", 'Unknown')) as "region",
            '' as "phone",
            '' as "email",
            MAX(COALESCE(ch."Description", 'N/A')) as "chain",
            'N/A' as "classification",
            true as "isActive",
            MAX(COALESCE(t."UserCode", '')) as "salesmanCode",
            MAX(COALESCE(u."Description", 'Unknown')) as "salesmanName",
            MAX(COALESCE(c."SalesmanCode", '')) as "teamLeaderCode",
            MAX(COALESCE(c."SalesmanName", 'Unknown')) as "teamLeaderName",
            MAX(COALESCE(t."RouteCode", '')) as "routeCode",
            MAX(COALESCE(r."Description", t."RouteCode", 'Unknown')) as "routeName"
          FROM ${transactionsTable} t
          LEFT JOIN "tblCustomer" c ON t."ClientCode" = c."Code"
          LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
          LEFT JOIN "tblRoute" r ON t."RouteCode" = r."Code"
          LEFT JOIN "tblCustomerDetail" cd ON c."Code" = cd."CustomerCode"
          LEFT JOIN "tblChannel" ch ON TRIM(cd."ChannelCode") = TRIM(ch."Code")
          WHERE t."ClientCode" = $1
          GROUP BY t."ClientCode"
          LIMIT 1
        `
      } else {
        transCustomerQuery = `
          SELECT
            t.${col.storeCode} as "customerCode",
            MAX(COALESCE(t.${col.storeName}, 'Unknown')) as "customerName",
            '' as "address",
            MAX('Unknown') as "city",
            MAX('Unknown') as "region",
            '' as "phone",
            '' as "email",
            'N/A' as "chain",
            'N/A' as "classification",
            true as "isActive",
            MAX(COALESCE(t.${col.fieldUserCode}, '')) as "salesmanCode",
            'Unknown' as "salesmanName",
            '' as "routeCode"
          FROM ${transactionsTable} t
          WHERE t.${col.storeCode} = $1
          GROUP BY t.${col.storeCode}
          LIMIT 1
        `
      }

      const transResult = await query(transCustomerQuery, [customerCode])

      if (transResult.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Customer not found'
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        data: transResult.rows[0]
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: customerResult.rows[0]
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })

  } catch (error) {
    console.error('Customer details API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

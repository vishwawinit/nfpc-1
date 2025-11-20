import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    await db.initialize()
    
    const customerCode = params.code
    
    // First check if customer exists in master table
    const customerQuery = `
      SELECT 
        customer_code as "customerCode",
        customer_name as "customerName",
        address1 as "address",
        city_name as "city",
        region_name as "region",
        contact_no1 as "phone",
        '' as "email",
        chain_name as "chain",
        classification,
        is_active as "isActive"
      FROM flat_customers_master
      WHERE customer_code = $1
      LIMIT 1
    `
    
    const customerResult = await query(customerQuery, [customerCode])
    
    if (customerResult.rows.length === 0) {
      // If not in master, try to get from transactions using dynamic columns
      const tableInfo = await resolveTransactionsTable()
      const transactionsTable = tableInfo.name
      const col = getTransactionColumnExpressions(tableInfo.columns)
      
      const transCustomerQuery = `
        SELECT 
          ${col.storeCode} as "customerCode",
          MAX(${col.storeName}) as "customerName",
          '' as "address",
          MAX(COALESCE(${col.storeCity}, 'Unknown')) as "city",
          MAX(COALESCE(${col.storeRegion}, 'Unknown')) as "region",
          '' as "phone",
          '' as "email",
          MAX(COALESCE(c.chain_name, 'N/A')) as "chain",
          'N/A' as "classification",
          true as "isActive"
        FROM ${transactionsTable} t
        LEFT JOIN flat_customers_master c ON ${col.storeCode} = c.customer_code
        WHERE ${col.storeCode} = $1
        GROUP BY ${col.storeCode}
        LIMIT 1
      `
      
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
      })
    }
    
    return NextResponse.json({
      success: true,
      data: customerResult.rows[0]
    })
    
  } catch (error) {
    console.error('Customer details API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

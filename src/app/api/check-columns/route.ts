import { NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate') || '2025-07-13'
  const endDate = searchParams.get('endDate') || '2025-11-01'
  
  try {
    // Get columns from flat_transactions
    const columnsResult = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'flat_transactions'
      ORDER BY ordinal_position
    `)
    
    const columns = columnsResult.rows.map(r => r.column_name)
    
    // Check what columns we have
    const columnCheck = {
      // Transaction ID
      has_transaction_code: columns.includes('transaction_code'),
      has_trx_code: columns.includes('trx_code'),
      
      // Date
      has_transaction_date: columns.includes('transaction_date'),
      has_trx_date: columns.includes('trx_date'),
      has_trx_date_only: columns.includes('trx_date_only'),
      
      // Customer/Store
      has_customer_code: columns.includes('customer_code'),
      has_store_code: columns.includes('store_code'),
      
      // User
      has_user_code: columns.includes('user_code'),
      has_field_user_code: columns.includes('field_user_code'),
      
      // Product
      has_product_code: columns.includes('product_code'),
      
      // Amounts
      has_net_amount: columns.includes('net_amount'),
      has_line_amount: columns.includes('line_amount'),
      
      // Quantity
      has_quantity: columns.includes('quantity'),
      has_quantity_bu: columns.includes('quantity_bu')
    }
    
    // Build actual query based on available columns
    const trxCodeCol = columnCheck.has_transaction_code ? 'transaction_code' : 'trx_code'
    const dateCol = columnCheck.has_transaction_date ? 'DATE(transaction_date)' : 'trx_date_only'
    const customerCol = columnCheck.has_customer_code ? 'customer_code' : 'store_code'
    const userCol = columnCheck.has_user_code ? 'user_code' : 'field_user_code'
    const amountCol = columnCheck.has_net_amount ? 'net_amount' : 'line_amount'
    const qtyCol = columnCheck.has_quantity_bu ? 'quantity_bu' : 'quantity'
    
    // Test actual query
    const testQuery = `
      SELECT 
        COUNT(DISTINCT ${trxCodeCol}) as orders,
        COUNT(DISTINCT ${customerCol}) as customers,
        COUNT(DISTINCT ${userCol}) as users,
        COUNT(DISTINCT product_code) as products,
        COALESCE(SUM(${amountCol}), 0) as total_sales,
        COALESCE(SUM(${qtyCol}), 0) as total_quantity
      FROM flat_transactions
      WHERE ${dateCol} >= $1 AND ${dateCol} <= $2
    `
    
    const testResult = await query(testQuery, [startDate, endDate])
    const data = testResult.rows[0]
    
    // Sample records
    const sampleQuery = `
      SELECT 
        ${trxCodeCol} as trx_code,
        ${dateCol} as date,
        ${customerCol} as customer,
        ${userCol} as user_code,
        product_code,
        ${amountCol} as amount,
        ${qtyCol} as quantity
      FROM flat_transactions
      WHERE ${dateCol} >= $1 AND ${dateCol} <= $2
      LIMIT 5
    `
    const sampleResult = await query(sampleQuery, [startDate, endDate])
    
    return NextResponse.json({
      status: 'success',
      columns: {
        available: columns,
        check: columnCheck,
        using: {
          trxCode: trxCodeCol,
          date: dateCol,
          customer: customerCol,
          user: userCol,
          amount: amountCol,
          quantity: qtyCol
        }
      },
      testQuery: {
        sql: testQuery,
        params: [startDate, endDate],
        results: {
          orders: parseInt(data.orders),
          customers: parseInt(data.customers),
          users: parseInt(data.users),
          products: parseInt(data.products),
          totalSales: parseFloat(data.total_sales),
          totalQuantity: parseFloat(data.total_quantity)
        }
      },
      sampleRecords: sampleResult.rows,
      recommendation: data.orders > 0 
        ? '✅ Query works! Data is accessible.' 
        : '❌ Query returns 0 - check date format or data'
    })
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}


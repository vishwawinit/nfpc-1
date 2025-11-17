import { NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: any = {
    status: 'checking',
    timestamp: new Date().toISOString(),
    tables: {},
    transactionTable: null,
    columns: {},
    dataStats: {},
    recentData: {},
    customerMaster: {},
    sampleRecords: [],
    criticalColumns: {},
    recommendations: []
  }

  try {
    // 1. Check which tables exist
    console.log('Checking available tables...')
    const tablesQuery = await query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND (tablename LIKE 'flat_%' OR tablename LIKE '%transaction%') 
      ORDER BY tablename
    `)
    results.tables = tablesQuery.rows.map(r => r.tablename)
    console.log('Found tables:', results.tables)

    // 2. Determine which transaction table exists
    const tableCheck = await query(`
      SELECT 
        to_regclass('public.flat_transactions') as ft,
        to_regclass('public.flat_sales_transactions') as fst
    `)
    const hasFlatTransactions = !!tableCheck.rows[0].ft
    const hasFlatSalesTransactions = !!tableCheck.rows[0].fst
    
    results.transactionTable = {
      flat_transactions: hasFlatTransactions,
      flat_sales_transactions: hasFlatSalesTransactions,
      using: hasFlatSalesTransactions ? 'flat_sales_transactions' : 'flat_transactions'
    }
    
    const transactionTable = results.transactionTable.using
    console.log('Using transaction table:', transactionTable)

    // 3. Get column structure
    const columnsQuery = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [transactionTable])
    
    const columnNames = columnsQuery.rows.map(r => r.column_name)
    results.columns = {
      total: columnNames.length,
      list: columnNames
    }
    console.log(`Found ${columnNames.length} columns in ${transactionTable}`)

    // 4. Check critical columns for Dashboard & Daily Sales
    const criticalCols = {
      // Transaction identifiers
      trx_code: columnNames.includes('trx_code'),
      transaction_code: columnNames.includes('transaction_code'),
      
      // Dates
      trx_date: columnNames.includes('trx_date'),
      transaction_date: columnNames.includes('transaction_date'),
      trx_date_only: columnNames.includes('trx_date_only'),
      
      // Customer/Store
      store_code: columnNames.includes('store_code'),
      customer_code: columnNames.includes('customer_code'),
      store_name: columnNames.includes('store_name'),
      store_region_code: columnNames.includes('store_region_code'),
      store_city_code: columnNames.includes('store_city_code'),
      store_classification: columnNames.includes('store_classification'),
      
      // Users
      field_user_code: columnNames.includes('field_user_code'),
      user_code: columnNames.includes('user_code'),
      field_user_name: columnNames.includes('field_user_name'),
      field_user_type: columnNames.includes('field_user_type'),
      tl_code: columnNames.includes('tl_code'),
      tl_name: columnNames.includes('tl_name'),
      
      // Products
      product_code: columnNames.includes('product_code'),
      product_name: columnNames.includes('product_name'),
      product_group_level1: columnNames.includes('product_group_level1'),
      product_group_level2: columnNames.includes('product_group_level2'),
      product_group_level3: columnNames.includes('product_group_level3'),
      product_base_uom: columnNames.includes('product_base_uom'),
      
      // Amounts
      quantity: columnNames.includes('quantity'),
      quantity_bu: columnNames.includes('quantity_bu'),
      net_amount: columnNames.includes('net_amount'),
      line_amount: columnNames.includes('line_amount'),
      unit_price: columnNames.includes('unit_price'),
      total_discount_amount: columnNames.includes('total_discount_amount'),
      
      // Other
      currency_code: columnNames.includes('currency_code')
    }
    results.criticalColumns = criticalCols

    // 5. Determine dynamic column expressions (same logic as dailySalesService)
    const col = {
      trxCode: criticalCols.trx_code ? 'trx_code' : 'transaction_code',
      trxDateOnly: criticalCols.trx_date_only ? 'trx_date_only' : 'DATE(transaction_date)',
      storeCode: criticalCols.store_code ? 'store_code' : 'customer_code',
      fieldUserCode: criticalCols.field_user_code 
        ? 'field_user_code' 
        : (criticalCols.user_code ? 'user_code' : 'NULL'),
      productCode: 'product_code',
      quantityValue: criticalCols.quantity_bu 
        ? 'COALESCE(quantity_bu, quantity, 0)'
        : (criticalCols.quantity ? 'COALESCE(quantity, 0)' : '0'),
      netAmountValue: criticalCols.net_amount
        ? 'COALESCE(net_amount, line_amount, 0)'
        : (criticalCols.line_amount ? 'COALESCE(line_amount, 0)' : '0')
    }

    // 6. Get data statistics
    console.log('Getting data statistics...')
    const statsQuery = await query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT ${col.trxCode}) as unique_transactions,
        COUNT(DISTINCT ${col.storeCode}) as unique_customers,
        COUNT(DISTINCT ${col.productCode}) as unique_products,
        COUNT(DISTINCT ${col.fieldUserCode}) as unique_users,
        MIN(${col.trxDateOnly}) as min_date,
        MAX(${col.trxDateOnly}) as max_date,
        COALESCE(SUM(${col.netAmountValue}), 0) as total_sales
      FROM ${transactionTable}
    `)
    results.dataStats = statsQuery.rows[0]
    console.log('Total records:', results.dataStats.total_records)

    // 7. Check recent data (last 30 days)
    console.log('Checking recent data...')
    const recentQuery = await query(`
      SELECT 
        COUNT(*) as recent_records,
        COUNT(DISTINCT ${col.trxCode}) as recent_orders,
        COUNT(DISTINCT ${col.storeCode}) as recent_customers,
        COALESCE(SUM(${col.quantityValue}), 0) as total_quantity,
        COALESCE(SUM(${col.netAmountValue}), 0) as total_sales
      FROM ${transactionTable}
      WHERE ${col.trxDateOnly} >= CURRENT_DATE - INTERVAL '30 days'
    `)
    results.recentData = recentQuery.rows[0]
    console.log('Recent records (30 days):', results.recentData.recent_records)

    // 8. Sample records
    console.log('Fetching sample records...')
    const sampleQuery = await query(`
      SELECT 
        ${col.trxCode} as transaction_code,
        ${col.trxDateOnly} as date,
        ${col.storeCode} as customer,
        ${col.productCode} as product,
        ${col.fieldUserCode} as user,
        ${col.quantityValue} as quantity,
        ${col.netAmountValue} as amount
      FROM ${transactionTable}
      ORDER BY ${col.trxDateOnly} DESC
      LIMIT 5
    `)
    results.sampleRecords = sampleQuery.rows

    // 9. Check flat_customers_master
    console.log('Checking flat_customers_master...')
    const customerQuery = await query(`
      SELECT 
        COUNT(*) as total_customers,
        COUNT(DISTINCT state) as unique_states,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(DISTINCT customer_type) as unique_types,
        COUNT(DISTINCT sales_person_code) as unique_sales_persons
      FROM flat_customers_master
    `)
    results.customerMaster = customerQuery.rows[0]

    // 10. Generate recommendations
    if (parseInt(results.recentData.recent_records) === 0) {
      results.recommendations.push('⚠️ No data in the last 30 days - check if data is being loaded')
    }
    
    if (!criticalCols.field_user_code && !criticalCols.user_code) {
      results.recommendations.push('⚠️ No user code column found - user-based queries will fail')
    }
    
    if (!criticalCols.net_amount && !criticalCols.line_amount) {
      results.recommendations.push('⚠️ No amount column found - sales calculations will return 0')
    }
    
    if (!criticalCols.product_group_level1) {
      results.recommendations.push('ℹ️ No product_group_level1 - category filters unavailable')
    }

    if (results.recommendations.length === 0) {
      results.recommendations.push('✅ All critical columns found and data is available')
    }

    results.status = 'success'
    
    return NextResponse.json(results, { status: 200 })
    
  } catch (error) {
    console.error('Database verification error:', error)
    results.status = 'error'
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    return NextResponse.json(results, { status: 500 })
  }
}


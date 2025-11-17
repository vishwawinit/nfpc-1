import { NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    status: 'running'
  }

  console.log('🧪 Testing Dashboard KPI Queries')

  try {
    // Determine which transaction table to use
    const tableCheck = await query(`
      SELECT 
        to_regclass('public.flat_transactions') as ft,
        to_regclass('public.flat_sales_transactions') as fst
    `)
    const transactionTable = tableCheck.rows[0].fst ? 'flat_sales_transactions' : 'flat_transactions'
    
    results.transactionTable = transactionTable
    console.log('Using transaction table:', transactionTable)

    // Get columns
    const columnsResult = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [transactionTable])
    const columns = columnsResult.rows.map(r => r.column_name)
    
    // Determine column names dynamically
    const has = (col: string) => columns.includes(col)
    const col = {
      trxCode: has('trx_code') ? 'trx_code' : 'transaction_code',
      trxDate: has('trx_date_only') ? 'trx_date_only' : 'DATE(transaction_date)',
      customerCode: has('customer_code') ? 'customer_code' : 'store_code',
      userCode: has('user_code') ? 'user_code' : (has('field_user_code') ? 'field_user_code' : 'NULL'),
      quantityBu: has('quantity_bu') ? 'quantity_bu' : (has('quantity') ? 'quantity' : '0'),
      netAmount: has('net_amount') ? 'net_amount' : (has('line_amount') ? 'line_amount' : '0')
    }

    // Test date ranges
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    results.dateRange = { startDate: startDateStr, endDate: endDateStr }

    // Test 1: Dashboard KPI Query (same as /api/dashboard/kpi)
    console.log('Testing Dashboard KPI Query...')
    try {
      const kpiQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN t.${col.netAmount} >= 0 THEN t.${col.netAmount} ELSE 0 END), 0) as total_sales,
          COALESCE(SUM(CASE WHEN t.${col.netAmount} < 0 THEN ABS(t.${col.netAmount}) ELSE 0 END), 0) as return_sales,
          COALESCE(SUM(t.${col.netAmount}), 0) as net_sales,
          COUNT(DISTINCT CASE WHEN t.${col.netAmount} >= 0 THEN t.${col.trxCode} END) as total_orders,
          COUNT(DISTINCT CASE WHEN t.${col.netAmount} < 0 THEN t.${col.trxCode} END) as return_orders,
          COUNT(DISTINCT t.${col.customerCode}) as unique_customers,
          COALESCE(SUM(CASE WHEN t.${col.netAmount} >= 0 THEN t.${col.quantityBu} ELSE 0 END), 0) as total_quantity,
          COALESCE(MAX(t.currency_code), 'AED') as currency_code,
          COUNT(*) as total_records
        FROM ${transactionTable} t
        LEFT JOIN flat_customers_master c ON t.${col.customerCode} = c.customer_code
        WHERE DATE(t.${col.trxDate}) >= $1 AND DATE(t.${col.trxDate}) <= $2
      `
      
      const kpiResult = await query(kpiQuery, [startDateStr, endDateStr])
      const kpi = kpiResult.rows[0]
      
      results.tests.dashboardKPI = {
        status: 'success',
        data: {
          totalSales: parseFloat(kpi.total_sales),
          returnSales: parseFloat(kpi.return_sales),
          netSales: parseFloat(kpi.net_sales),
          totalOrders: parseInt(kpi.total_orders),
          returnOrders: parseInt(kpi.return_orders),
          uniqueCustomers: parseInt(kpi.unique_customers),
          totalQuantity: parseFloat(kpi.total_quantity),
          currencyCode: kpi.currency_code,
          totalRecords: parseInt(kpi.total_records)
        }
      }
      console.log('✅ Dashboard KPI:', results.tests.dashboardKPI.data)
    } catch (error: any) {
      results.tests.dashboardKPI = {
        status: 'error',
        error: error.message,
        stack: error.stack
      }
      console.error('❌ Dashboard KPI failed:', error.message)
    }

    // Test 2: Sales Trend Query (same as /api/dashboard/sales-trend)
    console.log('Testing Sales Trend Query...')
    try {
      const trendQuery = `
        SELECT
          DATE(t.${col.trxDate}) as date,
          COALESCE(SUM(t.${col.netAmount}), 0) as sales,
          COUNT(DISTINCT t.${col.trxCode}) as orders,
          COUNT(DISTINCT t.${col.customerCode}) as customers
        FROM ${transactionTable} t
        WHERE DATE(t.${col.trxDate}) >= $1 AND DATE(t.${col.trxDate}) <= $2
        GROUP BY DATE(t.${col.trxDate})
        ORDER BY DATE(t.${col.trxDate})
        LIMIT 100
      `
      
      const trendResult = await query(trendQuery, [startDateStr, endDateStr])
      
      results.tests.salesTrend = {
        status: 'success',
        data: {
          recordCount: trendResult.rows.length,
          sample: trendResult.rows.slice(0, 5).map((r: any) => ({
            date: r.date,
            sales: parseFloat(r.sales),
            orders: parseInt(r.orders),
            customers: parseInt(r.customers)
          })),
          totalSales: trendResult.rows.reduce((sum: number, r: any) => sum + parseFloat(r.sales), 0)
        }
      }
      console.log('✅ Sales Trend:', results.tests.salesTrend.data.recordCount, 'days')
    } catch (error: any) {
      results.tests.salesTrend = {
        status: 'error',
        error: error.message
      }
      console.error('❌ Sales Trend failed:', error.message)
    }

    // Test 3: Top Customers Query
    console.log('Testing Top Customers Query...')
    try {
      const customersQuery = `
        SELECT
          t.${col.customerCode} as customer_code,
          COALESCE(MAX(c.customer_name), 'Unknown') as customer_name,
          COUNT(DISTINCT t.${col.trxCode}) as orders,
          COALESCE(SUM(t.${col.netAmount}), 0) as total_sales
        FROM ${transactionTable} t
        LEFT JOIN flat_customers_master c ON t.${col.customerCode} = c.customer_code
        WHERE DATE(t.${col.trxDate}) >= $1 AND DATE(t.${col.trxDate}) <= $2
        GROUP BY t.${col.customerCode}
        ORDER BY total_sales DESC
        LIMIT 10
      `
      
      const customersResult = await query(customersQuery, [startDateStr, endDateStr])
      
      results.tests.topCustomers = {
        status: 'success',
        data: {
          count: customersResult.rows.length,
          topCustomers: customersResult.rows.map((r: any) => ({
            code: r.customer_code,
            name: r.customer_name,
            orders: parseInt(r.orders),
            sales: parseFloat(r.total_sales)
          }))
        }
      }
      console.log('✅ Top Customers:', results.tests.topCustomers.data.count, 'records')
    } catch (error: any) {
      results.tests.topCustomers = {
        status: 'error',
        error: error.message
      }
      console.error('❌ Top Customers failed:', error.message)
    }

    // Test 4: Filters Query
    console.log('Testing Filters Query...')
    try {
      const filtersQuery = `
        SELECT
          COUNT(DISTINCT c.state) as states,
          COUNT(DISTINCT c.city) as cities,
          COUNT(DISTINCT c.customer_type) as customer_types,
          COUNT(DISTINCT c.sales_person_code) as sales_persons
        FROM flat_customers_master c
      `
      
      const filtersResult = await query(filtersQuery)
      
      results.tests.filters = {
        status: 'success',
        data: filtersResult.rows[0]
      }
      console.log('✅ Filters:', results.tests.filters.data)
    } catch (error: any) {
      results.tests.filters = {
        status: 'error',
        error: error.message
      }
      console.error('❌ Filters failed:', error.message)
    }

    // Check overall status
    const testResults = Object.values(results.tests)
    const failedTests = testResults.filter((t: any) => t.status === 'error')
    const successTests = testResults.filter((t: any) => t.status === 'success')

    results.status = failedTests.length === 0 ? 'success' : 'partial'
    results.summary = {
      total: testResults.length,
      success: successTests.length,
      failed: failedTests.length,
      columnMappings: col
    }

    if (failedTests.length === 0) {
      console.log('✅ All Dashboard tests passed!')
    } else {
      console.log(`⚠️ ${failedTests.length} of ${testResults.length} tests failed`)
    }

    return NextResponse.json(results, {
      status: failedTests.length === 0 ? 200 : 500
    })

  } catch (error) {
    console.error('Test suite error:', error)
    results.status = 'error'
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    return NextResponse.json(results, { status: 500 })
  }
}


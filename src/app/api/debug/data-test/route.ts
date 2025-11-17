import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Debug API to test database connectivity and data availability
 * This helps identify why dashboard components are showing 0 values
 */
export async function GET(request: NextRequest) {
  try {
    const results: any = {}

    // 1. Basic table counts
    console.log('🔍 Testing database connectivity and table counts...')
    
    try {
      const flatTransactionsCount = await query('SELECT COUNT(*) as count FROM flat_transactions')
      results.flatTransactionsCount = flatTransactionsCount.rows[0]?.count || 0
    } catch (err) {
      results.flatTransactionsError = err instanceof Error ? err.message : 'Unknown error'
    }

    try {
      const flatCustomersCount = await query('SELECT COUNT(*) as count FROM flat_customers_master')
      results.flatCustomersCount = flatCustomersCount.rows[0]?.count || 0
    } catch (err) {
      results.flatCustomersError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 2. Date range analysis
    console.log('📅 Testing date ranges in data...')
    
    try {
      const dateRange = await query(`
        SELECT 
          MIN(transaction_date) as earliest_date,
          MAX(transaction_date) as latest_date,
          COUNT(*) as total_records,
          COUNT(DISTINCT DATE(transaction_date)) as unique_days
        FROM flat_transactions
      `)
      results.dateRange = dateRange.rows[0]
    } catch (err) {
      results.dateRangeError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 3. Sample recent transactions
    console.log('💰 Testing recent transaction data...')
    
    try {
      const recentTransactions = await query(`
        SELECT 
          transaction_code,
          customer_code,
          product_code,
          net_amount,
          quantity_bu,
          transaction_date,
          currency_code
        FROM flat_transactions 
        WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY transaction_date DESC 
        LIMIT 5
      `)
      results.recentTransactions = recentTransactions.rows
    } catch (err) {
      results.recentTransactionsError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 4. Test KPI-style aggregation
    console.log('📊 Testing KPI aggregation...')
    
    try {
      const kpiTest = await query(`
        SELECT
          COALESCE(SUM(CASE WHEN net_amount >= 0 THEN net_amount ELSE 0 END), 0) as total_sales,
          COALESCE(SUM(CASE WHEN net_amount < 0 THEN ABS(net_amount) ELSE 0 END), 0) as return_sales,
          COUNT(DISTINCT CASE WHEN net_amount >= 0 THEN transaction_code END) as total_orders,
          COUNT(DISTINCT customer_code) as unique_customers,
          COALESCE(SUM(CASE WHEN net_amount >= 0 THEN quantity_bu ELSE 0 END), 0) as total_quantity,
          COUNT(*) as total_records
        FROM flat_transactions t
        WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '7 days'
      `)
      results.kpiTest = kpiTest.rows[0]
    } catch (err) {
      results.kpiTestError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 5. Test top customers (simple version)
    console.log('👥 Testing top customers...')
    
    try {
      const topCustomers = await query(`
        SELECT
          t.customer_code,
          SUM(ABS(t.net_amount)) as total_sales,
          COUNT(*) as transaction_count
        FROM flat_transactions t
        WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY t.customer_code
        HAVING SUM(ABS(t.net_amount)) > 0
        ORDER BY total_sales DESC
        LIMIT 5
      `)
      results.topCustomersTest = topCustomers.rows
    } catch (err) {
      results.topCustomersError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 6. Test top products (simple version)
    console.log('🛍️ Testing top products...')
    
    try {
      const topProducts = await query(`
        SELECT
          t.product_code,
          SUM(ABS(t.net_amount)) as total_sales,
          SUM(ABS(t.quantity_bu)) as total_quantity,
          COUNT(*) as transaction_count
        FROM flat_transactions t
        WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY t.product_code
        HAVING SUM(ABS(t.net_amount)) > 0
        ORDER BY total_sales DESC
        LIMIT 5
      `)
      results.topProductsTest = topProducts.rows
    } catch (err) {
      results.topProductsError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 7. Test JOIN with customers master
    console.log('🔗 Testing JOIN with customers master...')
    
    try {
      const joinTest = await query(`
        SELECT
          COUNT(*) as total_joined_records,
          COUNT(c.customer_code) as records_with_customer_master,
          COUNT(DISTINCT t.customer_code) as unique_transaction_customers,
          COUNT(DISTINCT c.customer_code) as unique_master_customers
        FROM flat_transactions t
        LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
        WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '7 days'
      `)
      results.joinTest = joinTest.rows[0]
    } catch (err) {
      results.joinTestError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 8. Test filter data availability
    console.log('🎛️ Testing filter data...')
    
    try {
      const filterTest = await query(`
        SELECT 
          COUNT(DISTINCT c.state) as unique_states,
          COUNT(DISTINCT c.city) as unique_cities,
          COUNT(DISTINCT c.customer_type) as unique_customer_types,
          COUNT(DISTINCT c.sales_person_code) as unique_sales_persons
        FROM flat_customers_master c
        WHERE c.state IS NOT NULL OR c.city IS NOT NULL
      `)
      results.filterTest = filterTest.rows[0]
    } catch (err) {
      results.filterTestError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 9. Test current date transactions
    console.log('🎯 Testing today\'s data...')
    
    try {
      const todayTest = await query(`
        SELECT
          COUNT(*) as today_transactions,
          SUM(ABS(net_amount)) as today_sales,
          MIN(transaction_date) as earliest_today,
          MAX(transaction_date) as latest_today
        FROM flat_transactions
        WHERE DATE(transaction_date) = CURRENT_DATE
      `)
      results.todayTest = todayTest.rows[0]
    } catch (err) {
      results.todayTestError = err instanceof Error ? err.message : 'Unknown error'
    }

    // 10. Get sample filter values
    console.log('🔍 Getting sample filter values...')
    
    try {
      const sampleStates = await query(`
        SELECT DISTINCT state FROM flat_customers_master 
        WHERE state IS NOT NULL AND state != '' 
        ORDER BY state LIMIT 5
      `)
      results.sampleStates = sampleStates.rows

      const sampleCities = await query(`
        SELECT DISTINCT city FROM flat_customers_master 
        WHERE city IS NOT NULL AND city != '' 
        ORDER BY city LIMIT 5
      `)
      results.sampleCities = sampleCities.rows
    } catch (err) {
      results.sampleFiltersError = err instanceof Error ? err.message : 'Unknown error'
    }

    console.log('✅ Database test completed successfully!')

    return NextResponse.json({
      success: true,
      message: 'Database connectivity and data test completed',
      timestamp: new Date().toISOString(),
      results,
      recommendations: generateRecommendations(results)
    })

  } catch (error) {
    console.error('❌ Database test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Database test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

function generateRecommendations(results: any): string[] {
  const recommendations: string[] = []

  if (results.flatTransactionsCount === 0) {
    recommendations.push('❌ No data found in flat_transactions table - check data import')
  }

  if (results.flatCustomersCount === 0) {
    recommendations.push('❌ No data found in flat_customers_master table - check customer master data')
  }

  if (results.kpiTest && results.kpiTest.total_sales == 0) {
    recommendations.push('⚠️ No sales found in last 7 days - check date ranges or transaction data')
  }

  if (results.joinTest && results.joinTest.records_with_customer_master == 0) {
    recommendations.push('⚠️ No matching records between transactions and customers master - check JOIN keys')
  }

  if (results.topCustomersTest && results.topCustomersTest.length == 0) {
    recommendations.push('⚠️ No top customers found - check date filters and transaction data')
  }

  if (results.topProductsTest && results.topProductsTest.length == 0) {
    recommendations.push('⚠️ No top products found - check date filters and product data')
  }

  if (results.todayTest && results.todayTest.today_transactions == 0) {
    recommendations.push('ℹ️ No transactions found for today - this may be normal depending on business hours')
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All tests passed - data looks good!')
  }

  return recommendations
}

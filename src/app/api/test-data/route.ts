import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Test data availability in database
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing database data availability...')

    // Test 1: Basic table access
    const totalRecords = await query('SELECT COUNT(*) as count FROM flat_transactions')
    console.log('📊 Total records in flat_transactions:', totalRecords.rows[0]?.count)

    // Test 2: Records with non-zero sales
    const nonZeroSales = await query("SELECT COUNT(*) as count FROM flat_transactions WHERE net_amount != 0")
    console.log('💰 Records with non-zero net_amount:', nonZeroSales.rows[0]?.count)

    // Test 2b: Check actual net_amount range
    const amountRange = await query("SELECT MIN(net_amount) as min_amount, MAX(net_amount) as max_amount FROM flat_transactions")
    console.log('📊 Net amount range:', amountRange.rows[0])

    // Test 3: Sample raw data
    const sampleData = await query(`
      SELECT 
        customer_code, customer_name, product_code, product_name, 
        net_amount, quantity_bu, transaction_date
      FROM flat_transactions 
      WHERE net_amount != 0 
      ORDER BY ABS(net_amount) DESC 
      LIMIT 5
    `)
    console.log('📋 Sample data:', sampleData.rows)

    // Test 4: Customer master table
    const customerMaster = await query('SELECT COUNT(*) as count FROM flat_customers_master')
    console.log('👥 Records in customer master:', customerMaster.rows[0]?.count)

    // Test 5: Top customers (very simple)
    const topCustomers = await query(`
      SELECT 
        customer_code,
        customer_name,
        SUM(net_amount) as total_sales
      FROM flat_transactions 
      WHERE net_amount != 0
      GROUP BY customer_code, customer_name
      ORDER BY ABS(SUM(net_amount)) DESC 
      LIMIT 5
    `)
    console.log('🏆 Top customers data:', topCustomers.rows)

    // Test 6: Top products (very simple)
    const topProducts = await query(`
      SELECT 
        product_code,
        product_name,
        SUM(net_amount) as total_sales
      FROM flat_transactions 
      WHERE net_amount != 0 AND product_code IS NOT NULL
      GROUP BY product_code, product_name
      ORDER BY ABS(SUM(net_amount)) DESC 
      LIMIT 5
    `)
    console.log('📦 Top products data:', topProducts.rows)

    return NextResponse.json({
      success: true,
      results: {
        totalRecords: totalRecords.rows[0]?.count || 0,
        nonZeroSales: nonZeroSales.rows[0]?.count || 0,
        amountRange: amountRange.rows[0],
        customerMasterRecords: customerMaster.rows[0]?.count || 0,
        sampleData: sampleData.rows,
        topCustomers: topCustomers.rows,
        topProducts: topProducts.rows
      },
      message: "Database test completed - check console logs for details"
    })

  } catch (error) {
    console.error('🚨 Database test error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Database test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}

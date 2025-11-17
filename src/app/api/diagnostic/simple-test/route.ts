import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Ultra-simple diagnostic API to test basic database connectivity
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Starting simple diagnostic test...')

    // Test 1: Basic database connection
    console.log('🔍 Testing database connection...')
    const connectionTest = await query('SELECT 1 as test_value')
    console.log('✅ Database connection successful')

    // Test 2: Check if flat_transactions table exists and has data
    console.log('🔍 Testing flat_transactions table...')
    const transactionTest = await query('SELECT COUNT(*) as count FROM flat_transactions LIMIT 1')
    const transactionCount = transactionTest.rows[0]?.count || 0
    console.log(`✅ flat_transactions has ${transactionCount} records`)

    // Test 3: Check if flat_customers_master table exists
    console.log('🔍 Testing flat_customers_master table...')
    const customerTest = await query('SELECT COUNT(*) as count FROM flat_customers_master LIMIT 1')
    const customerCount = customerTest.rows[0]?.count || 0
    console.log(`✅ flat_customers_master has ${customerCount} records`)

    // Test 4: Ultra-simple aggregation
    console.log('🔍 Testing simple aggregation...')
    const simpleAgg = await query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(net_amount) as total_amount
      FROM flat_transactions 
      LIMIT 1
    `)
    console.log('✅ Simple aggregation successful')

    // Test 5: Simple customer query (no GROUP BY complexity)
    console.log('🔍 Testing simple customer query...')
    const simpleCustomer = await query(`
      SELECT 
        customer_code,
        net_amount,
        transaction_date
      FROM flat_transactions 
      ORDER BY transaction_date DESC 
      LIMIT 3
    `)
    console.log(`✅ Simple customer query returned ${simpleCustomer.rows.length} rows`)

    return NextResponse.json({
      success: true,
      message: 'All basic tests passed!',
      diagnostics: {
        databaseConnection: '✅ Working',
        transactionTableCount: transactionCount,
        customerTableCount: customerCount,
        simpleAggregation: simpleAgg.rows[0],
        sampleTransactions: simpleCustomer.rows
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Diagnostic test failed:', error)
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    })
    
    return NextResponse.json({
      success: false,
      error: 'Diagnostic test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error instanceof Error ? error.stack : 'No stack trace',
        error: error
      } : undefined
    }, { status: 500 })
  }
}

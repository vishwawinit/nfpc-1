import { NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  
  const results: any = {
    timestamp: new Date().toISOString(),
    params: { startDate, endDate },
    steps: []
  }

  try {
    // Step 1: Check table resolution
    results.steps.push('Resolving transactions table...')
    const { name: transactionsTable, columns } = await resolveTransactionsTable()
    results.transactionTable = transactionsTable
    results.columnCount = columns.size
    results.steps.push(`✓ Using table: ${transactionsTable}`)
    
    // Step 2: Get column expressions
    const col = getTransactionColumnExpressions(columns)
    results.columnExpressions = {
      trxCode: col.trxCode,
      trxDateOnly: col.trxDateOnly,
      storeCode: col.storeCode,
      fieldUserCode: col.fieldUserCode,
      netAmountValue: col.netAmountValue
    }
    results.steps.push('✓ Column expressions generated')
    
    // Step 3: Test simple count query
    results.steps.push('Testing simple count query...')
    const countQuery = `SELECT COUNT(*) as total FROM ${transactionsTable}`
    const countResult = await query(countQuery)
    results.totalRecords = parseInt(countResult.rows[0].total)
    results.steps.push(`✓ Total records: ${results.totalRecords}`)
    
    // Step 4: Test date range query (if provided)
    if (startDate && endDate) {
      results.steps.push(`Testing date range query (${startDate} to ${endDate})...`)
      const dateQuery = `
        SELECT COUNT(*) as count
        FROM ${transactionsTable}
        WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
      `
      const dateResult = await query(dateQuery, [startDate, endDate])
      results.recordsInRange = parseInt(dateResult.rows[0].count)
      results.steps.push(`✓ Records in date range: ${results.recordsInRange}`)
      
      // Step 5: Test summary aggregation
      if (results.recordsInRange > 0) {
        results.steps.push('Testing summary aggregation...')
        const summaryQuery = `
          SELECT
            COUNT(DISTINCT ${col.trxCode}) as orders,
            COUNT(DISTINCT ${col.storeCode}) as stores,
            COUNT(DISTINCT ${col.fieldUserCode}) as users,
            COALESCE(SUM(${col.netAmountValue}), 0) as total_sales
          FROM ${transactionsTable}
          WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
        `
        const summaryResult = await query(summaryQuery, [startDate, endDate])
        results.summaryData = {
          orders: parseInt(summaryResult.rows[0].orders),
          stores: parseInt(summaryResult.rows[0].stores),
          users: parseInt(summaryResult.rows[0].users),
          totalSales: parseFloat(summaryResult.rows[0].total_sales)
        }
        results.steps.push('✓ Summary aggregation successful')
      } else {
        results.warning = 'No records found in the specified date range'
        results.steps.push('⚠ No data in date range - check if dates have data')
      }
    } else {
      results.steps.push('ℹ No date range provided - skipping date range tests')
      results.steps.push('ℹ Add ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD to test date range')
    }
    
    // Step 6: Check available dates
    results.steps.push('Checking available date range...')
    const dateRangeQuery = `
      SELECT 
        MIN(${col.trxDateOnly}) as min_date,
        MAX(${col.trxDateOnly}) as max_date,
        COUNT(DISTINCT ${col.trxDateOnly}) as unique_dates
      FROM ${transactionsTable}
    `
    const dateRangeResult = await query(dateRangeQuery)
    results.availableDateRange = {
      minDate: dateRangeResult.rows[0].min_date,
      maxDate: dateRangeResult.rows[0].max_date,
      uniqueDates: parseInt(dateRangeResult.rows[0].unique_dates)
    }
    results.steps.push(`✓ Data available from ${results.availableDateRange.minDate} to ${results.availableDateRange.maxDate}`)
    
    // Step 7: Recommendations
    results.recommendations = []
    if (!startDate || !endDate) {
      results.recommendations.push('💡 Add date range to URL: ?startDate=2024-08-01&endDate=2024-08-31')
    }
    if (results.recordsInRange === 0 && startDate && endDate) {
      results.recommendations.push(`⚠️ No data between ${startDate} and ${endDate}`)
      results.recommendations.push(`💡 Try a date range within ${results.availableDateRange.minDate} to ${results.availableDateRange.maxDate}`)
    }
    if (results.summaryData && results.summaryData.orders === 0) {
      results.recommendations.push('⚠️ Records exist but no valid transactions found - check data quality')
    }
    if (col.fieldUserCode === 'NULL') {
      results.recommendations.push('⚠️ No user code column found - user metrics will be 0')
    }
    
    results.status = 'success'
    results.steps.push('✅ All diagnostics complete')
    
    return NextResponse.json(results, { status: 200 })
    
  } catch (error) {
    console.error('Debug API error:', error)
    results.status = 'error'
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    results.steps.push('❌ Error occurred: ' + results.error.message)
    return NextResponse.json(results, { status: 500 })
  }
}


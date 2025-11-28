// Test raw database data to see what's actually stored for GF5201

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123@localhost:5432/nfpc'
})

const testRawData = async () => {
  try {
    console.log('=== Testing Raw Database Data for GF5201 ===\n')

    const startDate = '2025-11-01'
    const endDate = '2025-11-28'
    const userCode = '187219'

    // Get sample raw data for GF5201
    const sampleQuery = `
      SELECT
        line_itemcode,
        line_baseprice,
        line_quantitybu,
        line_baseprice * line_quantitybu as line_total_raw,
        (line_baseprice * line_quantitybu) / 100.0 as line_total_divided,
        trx_totalamount,
        trx_trxcode
      FROM flat_daily_sales_report
      WHERE line_itemcode = 'GF5201'
        AND trx_usercode = $3
        AND trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
      LIMIT 10
    `

    const sampleResult = await pool.query(sampleQuery, [startDate, endDate, userCode])

    console.log('Sample raw data rows for GF5201:')
    sampleResult.rows.forEach((row, i) => {
      console.log(`\nRow ${i+1}:`)
      console.log(`  line_baseprice: ${row.line_baseprice}`)
      console.log(`  line_quantitybu: ${row.line_quantitybu}`)
      console.log(`  line_total_raw (baseprice * qty): ${row.line_total_raw}`)
      console.log(`  line_total_divided (/ 100): ${row.line_total_divided}`)
      console.log(`  trx_totalamount: ${row.trx_totalamount}`)
    })

    // Get totals with and without division
    const totalQuery = `
      SELECT
        COUNT(*) as row_count,
        SUM(line_baseprice * line_quantitybu) as total_without_division,
        SUM((line_baseprice * line_quantitybu) / 100.0) as total_with_division
      FROM flat_daily_sales_report
      WHERE line_itemcode = 'GF5201'
        AND trx_usercode = $3
        AND trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
        AND (line_baseprice * line_quantitybu) > 0
    `

    const totalResult = await pool.query(totalQuery, [startDate, endDate, userCode])

    console.log('\n\n=== TOTALS FOR GF5201 ===')
    console.log(`Total rows: ${totalResult.rows[0].row_count}`)
    console.log(`Total WITHOUT /100 division: ${parseFloat(totalResult.rows[0].total_without_division).toFixed(2)} AED`)
    console.log(`Total WITH /100 division: ${parseFloat(totalResult.rows[0].total_with_division).toFixed(2)} AED`)
    console.log('')
    console.log(`Expected value (from user): 145,205.00 AED`)
    console.log('')

    const withoutDiv = parseFloat(totalResult.rows[0].total_without_division)
    const withDiv = parseFloat(totalResult.rows[0].total_with_division)

    if (Math.abs(withoutDiv - 145205) < 100) {
      console.log('✅ WITHOUT division matches expected value!')
      console.log('   SOLUTION: REMOVE the /100.0 division')
    } else if (Math.abs(withDiv - 145205) < 100) {
      console.log('✅ WITH division matches expected value!')
      console.log('   SOLUTION: KEEP the /100.0 division')
    } else {
      console.log('❌ Neither matches expected value')
      console.log('   Need to investigate further')
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

testRawData()

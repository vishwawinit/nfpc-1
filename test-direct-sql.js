// Direct SQL test to verify the CTE logic
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123@localhost:5432/nfpc'
})

const testDirectSQL = async () => {
  try {
    console.log('=== Testing Direct SQL ===\n')

    const startDate = '2025-11-01'
    const endDate = '2025-11-28'

    // Test 1: Dashboard-style query (what we expect to be correct)
    console.log('1. Dashboard-style query (direct transaction amounts):')
    const dashboardSQL = `
      SELECT
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as total_orders,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as gross_sales
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
    `
    const dashboardResult = await pool.query(dashboardSQL, [startDate, endDate])
    console.log('Orders:', dashboardResult.rows[0].total_orders)
    console.log('Gross Sales:', dashboardResult.rows[0].gross_sales)
    console.log('')

    // Test 2: CTE-based query (what Daily Sales Report should use)
    console.log('2. CTE-based query (GROUP BY trx_trxcode):')
    const cteSQL = `
      WITH transaction_aggregates AS (
        SELECT
          trx_trxcode,
          MAX(trx_totalamount) as trx_totalamount
        FROM flat_daily_sales_report
        WHERE trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
        GROUP BY trx_trxcode
      )
      SELECT
        COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as total_orders,
        COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as gross_sales
      FROM transaction_aggregates
    `
    const cteResult = await pool.query(cteSQL, [startDate, endDate])
    console.log('Orders:', cteResult.rows[0].total_orders)
    console.log('Gross Sales:', cteResult.rows[0].gross_sales)
    console.log('')

    // Test 3: Check for duplicates
    console.log('3. Checking for duplicate transactions:')
    const dupCheckSQL = `
      SELECT
        trx_trxcode,
        COUNT(*) as row_count,
        MAX(trx_totalamount) as amount
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
      GROUP BY trx_trxcode
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `
    const dupResult = await pool.query(dupCheckSQL, [startDate, endDate])
    console.log('Sample transactions with multiple rows:')
    dupResult.rows.forEach(row => {
      console.log(`  ${row.trx_trxcode}: ${row.row_count} rows, amount: ${row.amount}`)
    })
    console.log('')

    // Test 4: Total row count vs unique transactions
    console.log('4. Row count analysis:')
    const countSQL = `
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT trx_trxcode) as unique_transactions
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
    `
    const countResult = await pool.query(countSQL, [startDate, endDate])
    console.log('Total rows:', countResult.rows[0].total_rows)
    console.log('Unique transactions:', countResult.rows[0].unique_transactions)
    console.log('Rows per transaction:', (countResult.rows[0].total_rows / countResult.rows[0].unique_transactions).toFixed(2))

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

testDirectSQL()

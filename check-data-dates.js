const { Pool } = require('pg')

const pool = new Pool({
  host: '10.20.53.130',
  port: 5432,
  user: 'choithram',
  password: 'choithram',
  database: 'flat_nfpc_test'
})

async function checkDataDates() {
  const client = await pool.connect()

  try {
    // Check date range of data
    const dateRangeSQL = `
      SELECT
        MIN(trx_trxdate) as min_date,
        MAX(trx_trxdate) as max_date,
        COUNT(*) as total_rows,
        COUNT(DISTINCT trx_trxcode) as total_transactions
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
    `

    const dateResult = await client.query(dateRangeSQL)
    console.log('📅 DATE RANGE IN DATABASE:')
    console.log('Min Date:', dateResult.rows[0].min_date)
    console.log('Max Date:', dateResult.rows[0].max_date)
    console.log('Total Rows:', dateResult.rows[0].total_rows)
    console.log('Total Transactions:', dateResult.rows[0].total_transactions)
    console.log('')

    // Check available areas
    const areasSQL = `
      SELECT DISTINCT route_areacode, route_subareacode
      FROM flat_daily_sales_report
      WHERE route_areacode IS NOT NULL
        AND route_subareacode IS NOT NULL
        AND trx_trxtype = 1
      ORDER BY route_areacode, route_subareacode
      LIMIT 10
    `

    const areasResult = await client.query(areasSQL)
    console.log('📍 SAMPLE AREAS IN DATABASE:')
    areasResult.rows.forEach(row => {
      console.log(`  Area: ${row.route_areacode}, SubArea: ${row.route_subareacode}`)
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

checkDataDates()

const { Pool } = require('pg')
require('dotenv').config()

async function testQueryPlan() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    console.log('🔍 Analyzing LMTD Query Execution Plan\n')

    const startDate = '2025-11-01'
    const endDate = '2025-11-30'
    const lmtdStart = '2025-10-01'
    const lmtdEnd = '2025-10-30'
    const subAreaCode = 'DXB'

    // Test the MTD CTE query
    console.log('📊 Testing MTD CTE Query with DXB filter:\n')
    const mtdQuery = `
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT
        trx_usercode,
        customer_code,
        line_itemcode,
        COALESCE(MAX(route_salesmancode), '') as tl_code,
        MAX(customer_description) as store_name,
        MAX(customer_channel_description) as chain_name,
        MAX(line_itemdescription) as product_name,
        SUM(ABS(COALESCE(line_quantitybu, 0))) as mtd_quantity,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as mtd_revenue
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND route_subareacode = $3
      GROUP BY trx_usercode, customer_code, line_itemcode
      HAVING SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) > 0
    `

    const mtdResult = await pool.query(mtdQuery, [startDate, endDate, subAreaCode])
    console.log('MTD Query Plan:')
    console.log(mtdResult.rows.map(r => r['QUERY PLAN']).join('\n'))

    console.log('\n' + '='.repeat(80) + '\n')

    // Test the LMTD CTE query
    console.log('📊 Testing LMTD CTE Query with DXB filter:\n')
    const lmtdQuery = `
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT
        trx_usercode,
        customer_code,
        line_itemcode,
        SUM(ABS(COALESCE(line_quantitybu, 0))) as lmtd_quantity,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as lmtd_revenue
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND route_subareacode = $3
      GROUP BY trx_usercode, customer_code, line_itemcode
    `

    const lmtdResult = await pool.query(lmtdQuery, [lmtdStart, lmtdEnd, subAreaCode])
    console.log('LMTD Query Plan:')
    console.log(lmtdResult.rows.map(r => r['QUERY PLAN']).join('\n'))

    console.log('\n' + '='.repeat(80) + '\n')

    // Count how many rows we're dealing with
    console.log('📊 Row counts for DXB subarea:\n')
    const countQuery = `
      SELECT
        'MTD' as period,
        COUNT(*) as total_rows,
        COUNT(DISTINCT trx_usercode) as users,
        COUNT(DISTINCT customer_code) as stores,
        COUNT(DISTINCT line_itemcode) as products
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND route_subareacode = $3
      UNION ALL
      SELECT
        'LMTD' as period,
        COUNT(*) as total_rows,
        COUNT(DISTINCT trx_usercode) as users,
        COUNT(DISTINCT customer_code) as stores,
        COUNT(DISTINCT line_itemcode) as products
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= $4::date
        AND trx_trxdate <= $5::date
        AND route_subareacode = $6
    `

    const countResult = await pool.query(countQuery, [startDate, endDate, subAreaCode, lmtdStart, lmtdEnd, subAreaCode])
    console.log('Period   | Total Rows | Users | Stores | Products')
    console.log('-'.repeat(60))
    countResult.rows.forEach(row => {
      console.log(`${row.period.padEnd(8)} | ${String(row.total_rows).padEnd(10)} | ${String(row.users).padEnd(5)} | ${String(row.stores).padEnd(6)} | ${row.products}`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await pool.end()
  }
}

testQueryPlan()

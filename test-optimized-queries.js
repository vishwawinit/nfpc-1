const { Client } = require('pg')
require('dotenv').config({ path: '.env' })

async function testOptimizedQueries() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })

  try {
    await client.connect()
    console.log('✅ Connected to database')

    // Check database timezone
    const tzQuery = await client.query('SHOW timezone')
    console.log('\n⏰ Database timezone:', tzQuery.rows[0].TimeZone)

    // Test optimized timestamp-based query for top customers
    const optimizedQuery = `
      SELECT
        customer_code,
        COALESCE(MAX(customer_description), customer_code) as customer_name,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as total_sales,
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as total_orders,
        MIN(trx_trxdate) as first_order_date,
        MAX(trx_trxdate) as last_order_date
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= '2025-11-01 00:00:00'::timestamp
        AND trx_trxdate < ('2025-11-28'::date + INTERVAL '1 day')
        AND route_subareacode = 'ALN'
      GROUP BY customer_code
      HAVING customer_code IS NOT NULL
      ORDER BY COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) DESC
      LIMIT 20
    `

    console.log('\n🏆 Top 20 customers for ALN (Nov 1-28) using optimized timestamp query:\n')
    const startTime = Date.now()
    const topCustomers = await client.query(optimizedQuery)
    const queryTime = Date.now() - startTime

    console.log(`⚡ Query executed in ${queryTime}ms`)
    console.log(`📊 Number of customers returned: ${topCustomers.rows.length}`)

    // Calculate sum of top 20
    const top20Sum = topCustomers.rows.reduce((sum, row) => sum + parseFloat(row.total_sales), 0)
    console.log(`💰 Sum of top 20 customers: AED ${top20Sum.toFixed(2)}`)

    // Show first few customers
    console.log('\n🔍 First 5 customers:')
    console.table(topCustomers.rows.slice(0, 5))

    // Check for October data (should be none)
    const octoberCheckQuery = `
      SELECT
        COUNT(*) as october_count,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as october_sales
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= '2025-11-01 00:00:00'::timestamp
        AND trx_trxdate < ('2025-11-28'::date + INTERVAL '1 day')
        AND route_subareacode = 'ALN'
        AND DATE(trx_trxdate) < '2025-11-01'::date
    `

    console.log('\n📅 Checking for October 31 data in results:')
    const octoberCheck = await client.query(octoberCheckQuery)
    console.log(`October records found: ${octoberCheck.rows[0].october_count}`)
    console.log(`October sales amount: AED ${parseFloat(octoberCheck.rows[0].october_sales).toFixed(2)}`)

    if (parseInt(octoberCheck.rows[0].october_count) === 0) {
      console.log('✅ No October data included - date filtering is correct!')
    } else {
      console.log('⚠️ WARNING: October data found in results!')
    }

    // Check total sales for ALL customers in ALN using optimized query
    const totalQueryOptimized = `
      SELECT
        COUNT(DISTINCT customer_code) as total_customers,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
        COUNT(DISTINCT trx_trxcode) as total_orders
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= '2025-11-01 00:00:00'::timestamp
        AND trx_trxdate < ('2025-11-28'::date + INTERVAL '1 day')
        AND route_subareacode = 'ALN'
    `

    console.log('\n💰 Total sales for ALL customers in ALN (Nov 1-28):\n')
    const totals = await client.query(totalQueryOptimized)
    console.table(totals.rows)

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.end()
    console.log('\n✅ Connection closed')
  }
}

testOptimizedQueries()

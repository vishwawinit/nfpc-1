const { Client } = require('pg')
require('dotenv').config({ path: '.env' })

async function testDates() {
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

    // Test query to check date range for ALN sub-area
    const query = `
      SELECT
        DATE(trx_trxdate) as transaction_date,
        COUNT(*) as transaction_count,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND route_subareacode = 'ALN'
        AND DATE(trx_trxdate) >= '2025-10-30'::date
        AND DATE(trx_trxdate) <= '2025-11-04'::date
      GROUP BY DATE(trx_trxdate)
      ORDER BY DATE(trx_trxdate) ASC
    `

    console.log('\n📅 Checking dates for ALN sub-area from Oct 30 to Nov 4 (using DATE()):\n')
    const result = await client.query(query)

    console.table(result.rows)

    // Test with DATE() function (our fix)
    const topCustomerQueryWithDate = `
      SELECT
        customer_code,
        COALESCE(MAX(customer_description), customer_code) as customer_name,
        COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as total_sales,
        COUNT(DISTINCT CASE WHEN trx_totalamount > 0 THEN trx_trxcode END) as total_orders,
        MIN(trx_trxdate) as first_order_date,
        MAX(trx_trxdate) as last_order_date
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND DATE(trx_trxdate) >= '2025-11-01'::date
        AND DATE(trx_trxdate) <= '2025-11-28'::date
        AND route_subareacode = 'ALN'
      GROUP BY customer_code
      HAVING customer_code IS NOT NULL
      ORDER BY COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) DESC
      LIMIT 20
    `

    console.log('\n🏆 Top 20 customers for ALN (Nov 1-28) using DATE():\n')
    const topCustomers = await client.query(topCustomerQueryWithDate)

    // Calculate sum of top 20
    const top20Sum = topCustomers.rows.reduce((sum, row) => sum + parseFloat(row.total_sales), 0)
    console.log('Sum of top 20 customers:', top20Sum.toFixed(2))
    console.table(topCustomers.rows)

    // Check total sales for ALL customers in ALN using DATE()
    const totalQueryWithDate = `
      SELECT
        COUNT(DISTINCT customer_code) as total_customers,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
        COUNT(DISTINCT trx_trxcode) as total_orders
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND DATE(trx_trxdate) >= '2025-11-01'::date
        AND DATE(trx_trxdate) <= '2025-11-28'::date
        AND route_subareacode = 'ALN'
    `

    console.log('\n💰 Total sales for ALL customers in ALN (Nov 1-28) using DATE():\n')
    const totals = await client.query(totalQueryWithDate)
    console.table(totals.rows)

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.end()
    console.log('\n✅ Connection closed')
  }
}

testDates()

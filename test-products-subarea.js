require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

async function testProductsSubArea() {
  try {
    console.log('🔍 Analyzing sub-areas by sales transactions (last month)...\n')

    // Get last month date range
    const currentDate = new Date()
    const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0)

    const formatDate = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const startDate = formatDate(lastMonthStart)
    const endDate = formatDate(lastMonthEnd)

    console.log(`📅 Date Range: ${startDate} to ${endDate}\n`)

    // Check if region_code and sub_area_code exist in flat_daily_sales_report
    const columnsCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'flat_daily_sales_report'
        AND column_name IN ('route_areacode', 'route_subareacode')
    `)

    console.log('📋 Available region/area columns:', columnsCheck.rows.map(r => r.column_name).join(', '))

    // Query to get sub-areas ordered by transaction count (ascending - smallest first)
    const result = await pool.query(`
      SELECT
        route_subareacode as sub_area_code,
        COUNT(*) as transaction_count,
        COUNT(DISTINCT line_itemcode) as product_count,
        COUNT(DISTINCT customer_code) as customer_count,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
      GROUP BY route_subareacode
      ORDER BY transaction_count ASC
      LIMIT 10
    `, [startDate, endDate])

    console.log('\n📊 Top 10 SMALLEST Sub-Areas (by transaction count):')
    console.log('=' .repeat(100))
    console.log('Sub-Area | Transactions | Products | Customers | Total Sales (AED)')
    console.log('-'.repeat(100))

    result.rows.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.sub_area_code.padEnd(12)} | ${String(row.transaction_count).padStart(12)} | ${String(row.product_count).padStart(8)} | ${String(row.customer_count).padStart(9)} | ${String(Math.round(row.total_sales)).padStart(18)}`)
    })

    if (result.rows.length > 0) {
      const smallest = result.rows[0]
      console.log('\n' + '='.repeat(100))
      console.log(`✅ RECOMMENDED DEFAULT: ${smallest.sub_area_code}`)
      console.log(`   - Transactions: ${smallest.transaction_count}`)
      console.log(`   - Products: ${smallest.product_count}`)
      console.log(`   - Customers: ${smallest.customer_count}`)
      console.log(`   - Total Sales: AED ${Math.round(smallest.total_sales).toLocaleString()}`)
      console.log('=' .repeat(100))
    }

    // Also show the largest for comparison
    const largestResult = await pool.query(`
      SELECT
        route_subareacode as sub_area_code,
        COUNT(*) as transaction_count,
        COUNT(DISTINCT line_itemcode) as product_count,
        COUNT(DISTINCT customer_code) as customer_count,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
      GROUP BY route_subareacode
      ORDER BY transaction_count DESC
      LIMIT 3
    `, [startDate, endDate])

    console.log('\n📊 Top 3 LARGEST Sub-Areas (for comparison):')
    console.log('=' .repeat(100))
    console.log('Sub-Area | Transactions | Products | Customers | Total Sales (AED)')
    console.log('-'.repeat(100))

    largestResult.rows.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.sub_area_code.padEnd(12)} | ${String(row.transaction_count).padStart(12)} | ${String(row.product_count).padStart(8)} | ${String(row.customer_count).padStart(9)} | ${String(Math.round(row.total_sales)).padStart(18)}`)
    })

    // Calculate performance difference
    if (result.rows.length > 0 && largestResult.rows.length > 0) {
      const smallest = result.rows[0]
      const largest = largestResult.rows[0]
      const speedupFactor = (largest.transaction_count / smallest.transaction_count).toFixed(1)
      console.log(`\n⚡ Expected speedup: ${speedupFactor}x faster than largest sub-area`)
    }

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await pool.end()
    process.exit(1)
  }
}

testProductsSubArea()

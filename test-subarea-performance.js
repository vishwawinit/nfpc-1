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

async function testSubAreaPerformance() {
  try {
    console.log('🔍 Analyzing sub-areas by visit count (last month)...\n')

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

    // Query to get sub-areas ordered by visit count (ascending - smallest first)
    const result = await pool.query(`
      SELECT
        sub_area_code,
        COUNT(*) as visit_count,
        COUNT(DISTINCT user_code) as user_count,
        COUNT(DISTINCT customer_code) as store_count,
        COUNT(DISTINCT route_code) as route_count
      FROM flat_customer_visit
      WHERE visit_date >= $1::date
        AND visit_date <= $2::date
        AND sub_area_code IS NOT NULL
      GROUP BY sub_area_code
      ORDER BY visit_count ASC
      LIMIT 10
    `, [startDate, endDate])

    console.log('📊 Top 10 SMALLEST Sub-Areas (by visit count):')
    console.log('=' .repeat(80))
    console.log('Sub-Area | Visits | Users | Stores | Routes')
    console.log('-'.repeat(80))

    result.rows.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.sub_area_code.padEnd(12)} | ${String(row.visit_count).padStart(6)} | ${String(row.user_count).padStart(5)} | ${String(row.store_count).padStart(6)} | ${String(row.route_count).padStart(6)}`)
    })

    if (result.rows.length > 0) {
      const smallest = result.rows[0]
      console.log('\n' + '='.repeat(80))
      console.log(`✅ RECOMMENDED DEFAULT: ${smallest.sub_area_code}`)
      console.log(`   - Visits: ${smallest.visit_count}`)
      console.log(`   - Users: ${smallest.user_count}`)
      console.log(`   - Stores: ${smallest.store_count}`)
      console.log(`   - Routes: ${smallest.route_count}`)
      console.log('=' .repeat(80))
    }

    // Also show the largest for comparison
    const largestResult = await pool.query(`
      SELECT
        sub_area_code,
        COUNT(*) as visit_count,
        COUNT(DISTINCT user_code) as user_count,
        COUNT(DISTINCT customer_code) as store_count,
        COUNT(DISTINCT route_code) as route_count
      FROM flat_customer_visit
      WHERE visit_date >= $1::date
        AND visit_date <= $2::date
        AND sub_area_code IS NOT NULL
      GROUP BY sub_area_code
      ORDER BY visit_count DESC
      LIMIT 3
    `, [startDate, endDate])

    console.log('\n📊 Top 3 LARGEST Sub-Areas (for comparison):')
    console.log('=' .repeat(80))
    console.log('Sub-Area | Visits | Users | Stores | Routes')
    console.log('-'.repeat(80))

    largestResult.rows.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.sub_area_code.padEnd(12)} | ${String(row.visit_count).padStart(6)} | ${String(row.user_count).padStart(5)} | ${String(row.store_count).padStart(6)} | ${String(row.route_count).padStart(6)}`)
    })

    // Calculate performance difference
    if (result.rows.length > 0 && largestResult.rows.length > 0) {
      const smallest = result.rows[0]
      const largest = largestResult.rows[0]
      const speedupFactor = (largest.visit_count / smallest.visit_count).toFixed(1)
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

testSubAreaPerformance()

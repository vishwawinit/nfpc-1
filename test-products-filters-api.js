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

async function testFiltersAPI() {
  try {
    console.log('🔍 Testing Products Filters API Query...\n')

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

    // Test 1: Fetch areas (should show all)
    console.log('TEST 1: Fetching Areas (should show all areas)...')
    const areasQuery = `
      SELECT
        route_areacode as code,
        route_areacode as name,
        COUNT(*) as count
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND route_areacode IS NOT NULL
        AND route_areacode != ''
      GROUP BY route_areacode
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `
    const areasResult = await pool.query(areasQuery, [startDate, endDate])
    console.log('✅ Areas found:', areasResult.rows.length)
    areasResult.rows.forEach(row => {
      console.log(`   - ${row.code}: ${row.count} transactions`)
    })

    // Test 2: Fetch sub-areas (should show all)
    console.log('\nTEST 2: Fetching Sub-Areas (should show all sub-areas)...')
    const subAreasQuery = `
      SELECT
        route_subareacode as code,
        route_subareacode as name,
        COUNT(*) as count
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
      GROUP BY route_subareacode
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `
    const subAreasResult = await pool.query(subAreasQuery, [startDate, endDate])
    console.log('✅ Sub-Areas found:', subAreasResult.rows.length)
    subAreasResult.rows.forEach(row => {
      console.log(`   - ${row.code}: ${row.count} transactions`)
    })

    // Test 3: Fetch sub-areas filtered by area
    console.log('\nTEST 3: Fetching Sub-Areas for specific area (should show filtered)...')
    const firstArea = areasResult.rows[0]?.code
    if (firstArea) {
      const filteredSubAreasQuery = `
        SELECT
          route_subareacode as code,
          route_subareacode as name,
          COUNT(*) as count
        FROM flat_daily_sales_report
        WHERE trx_trxdate >= $1::date
          AND trx_trxdate <= $2::date
          AND trx_trxtype = 1
          AND route_areacode = $3
          AND route_subareacode IS NOT NULL
          AND route_subareacode != ''
        GROUP BY route_subareacode
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `
      const filteredResult = await pool.query(filteredSubAreasQuery, [startDate, endDate, firstArea])
      console.log(`✅ Sub-Areas for area "${firstArea}":`, filteredResult.rows.length)
      filteredResult.rows.forEach(row => {
        console.log(`   - ${row.code}: ${row.count} transactions`)
      })
    }

    // Test 4: Fetch brands
    console.log('\nTEST 4: Fetching Brands...')
    const brandsQuery = `
      SELECT
        item_brand_description as code,
        item_brand_description as name,
        COUNT(*) as count
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND item_brand_description IS NOT NULL
        AND item_brand_description != ''
      GROUP BY item_brand_description
      ORDER BY SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) DESC
      LIMIT 10
    `
    const brandsResult = await pool.query(brandsQuery, [startDate, endDate])
    console.log('✅ Brands found:', brandsResult.rows.length)
    brandsResult.rows.forEach(row => {
      console.log(`   - ${row.code}: ${row.count} transactions`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('✅ All queries executed successfully!')
    console.log('If filters are empty in UI, check:')
    console.log('1. Network tab for /api/products/filters response')
    console.log('2. Console for any JavaScript errors')
    console.log('3. Verify result.success is true')
    console.log('4. Verify result.data.areas, result.data.subAreas exist')
    console.log('='.repeat(80))

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await pool.end()
    process.exit(1)
  }
}

testFiltersAPI()

const { Pool } = require('pg')
require('dotenv').config()

async function testAllSubAreas() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    const startDate = '2025-11-01'
    const endDate = '2025-11-30'
    const lmtdStart = '2025-10-01'
    const lmtdEnd = '2025-10-30'

    console.log('📊 Testing ALL Sub Areas Performance\n')
    console.log('Date Range: Nov 1-30, 2025 (MTD) vs Oct 1-30, 2025 (LMTD)\n')
    console.log('─'.repeat(100))

    // Step 1: Get all sub areas
    console.log('\n🔍 Step 1: Finding all sub areas...\n')
    const subAreasResult = await pool.query(`
      SELECT DISTINCT route_subareacode
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::date
        AND trx_trxdate <= $2::date
        AND trx_trxtype = 1
        AND route_subareacode IS NOT NULL
        AND route_subareacode != ''
      ORDER BY route_subareacode
    `, [lmtdStart, endDate])

    const subAreas = subAreasResult.rows.map(r => r.route_subareacode)
    console.log(`Found ${subAreas.length} sub areas:`, subAreas.join(', '))

    // Step 2: Get row counts for each sub area
    console.log('\n📊 Step 2: Checking data volume for each sub area...\n')

    const results = []

    for (const subArea of subAreas) {
      console.log(`Checking ${subArea}...`)

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

      const countResult = await pool.query(countQuery, [
        startDate, endDate, subArea,
        lmtdStart, lmtdEnd, subArea
      ])

      const mtdData = countResult.rows.find(r => r.period === 'MTD')
      const lmtdData = countResult.rows.find(r => r.period === 'LMTD')

      results.push({
        subArea,
        mtdRows: parseInt(mtdData.total_rows),
        lmtdRows: parseInt(lmtdData.total_rows),
        totalRows: parseInt(mtdData.total_rows) + parseInt(lmtdData.total_rows),
        mtdUsers: parseInt(mtdData.users),
        lmtdUsers: parseInt(lmtdData.users),
        mtdStores: parseInt(mtdData.stores),
        lmtdStores: parseInt(lmtdData.stores),
        mtdProducts: parseInt(mtdData.products),
        lmtdProducts: parseInt(lmtdData.products)
      })
    }

    // Sort by total rows (smallest first = fastest)
    results.sort((a, b) => a.totalRows - b.totalRows)

    console.log('\n' + '='.repeat(100))
    console.log('\n📊 RESULTS - Sorted by Data Volume (Smallest = Fastest Expected)\n')
    console.log('Sub Area | MTD Rows | LMTD Rows | Total Rows | MTD Stores | LMTD Stores | Speed Estimate')
    console.log('─'.repeat(100))

    results.forEach((r, i) => {
      const speedEstimate =
        r.totalRows < 50000 ? '⚡ VERY FAST (~5-10s)' :
        r.totalRows < 150000 ? '🚀 FAST (~10-20s)' :
        r.totalRows < 500000 ? '⏱️  MEDIUM (~20-40s)' :
        '🐌 SLOW (40s+)'

      console.log(
        `${(i + 1).toString().padStart(2)}. ${r.subArea.padEnd(8)} | ` +
        `${r.mtdRows.toLocaleString().padStart(9)} | ` +
        `${r.lmtdRows.toLocaleString().padStart(10)} | ` +
        `${r.totalRows.toLocaleString().padStart(11)} | ` +
        `${r.mtdStores.toString().padStart(10)} | ` +
        `${r.lmtdStores.toString().padStart(11)} | ` +
        `${speedEstimate}`
      )
    })

    console.log('\n' + '='.repeat(100))
    console.log('\n💡 RECOMMENDATIONS:\n')

    const fastest = results.slice(0, 3)
    const slowest = results.slice(-3)

    console.log('✅ FASTEST Sub Areas (Use these for default):')
    fastest.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.subArea} - ${r.totalRows.toLocaleString()} total rows`)
    })

    console.log('\n⚠️  SLOWEST Sub Areas (Change default from DXB!):')
    slowest.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.subArea} - ${r.totalRows.toLocaleString()} total rows`)
    })

    console.log('\n📝 Current default: DXB')
    const dxbData = results.find(r => r.subArea === 'DXB')
    if (dxbData) {
      const dxbRank = results.indexOf(dxbData) + 1
      console.log(`   DXB is #${dxbRank} out of ${results.length} (${dxbData.totalRows.toLocaleString()} rows)`)

      if (dxbRank > results.length / 2) {
        console.log('   ⚠️  WARNING: DXB is in the slower half!')
        console.log(`   💡 Consider changing default to: ${fastest[0].subArea} (${fastest[0].totalRows.toLocaleString()} rows)`)
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

testAllSubAreas()

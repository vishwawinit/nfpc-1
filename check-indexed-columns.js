const { Pool } = require('pg')
require('dotenv').config()

async function checkIndexedColumns() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    // Get all indexes and extract columns from them
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'flat_daily_sales_report'
      ORDER BY indexname
    `)

    console.log('📊 Analyzing Indexes on flat_daily_sales_report:\n')
    console.log(`Total Indexes: ${indexes.rows.length}\n`)

    // Key columns we use in LMTD queries
    const keyColumns = [
      'trx_trxdate',
      'trx_trxtype',
      'route_salesmancode',
      'trx_usercode',
      'route_areacode',
      'route_subareacode',
      'customer_channel_description',
      'customer_code',
      'item_grouplevel1',
      'line_itemcode'
    ]

    console.log('🔍 Checking indexes for LMTD query columns:\n')

    keyColumns.forEach(col => {
      const matchingIndexes = indexes.rows.filter(idx =>
        idx.indexdef.includes(col)
      )

      console.log(`Column: ${col}`)
      if (matchingIndexes.length === 0) {
        console.log(`  ❌ NO INDEX FOUND`)
      } else {
        console.log(`  ✅ ${matchingIndexes.length} index(es) found:`)
        matchingIndexes.forEach(idx => {
          console.log(`     - ${idx.indexname}`)
        })
      }
      console.log('')
    })

    // Show composite indexes specifically
    console.log('\n🔗 Composite Indexes (most important for performance):\n')
    const compositeIndexes = indexes.rows.filter(idx =>
      (idx.indexdef.match(/,/g) || []).length >= 1
    )

    compositeIndexes.forEach(idx => {
      console.log(`${idx.indexname}:`)
      console.log(`  ${idx.indexdef}`)
      console.log('')
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkIndexedColumns()

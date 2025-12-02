const { Pool } = require('pg')
require('dotenv').config()

async function createSubareaIndex() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    console.log('🔨 Creating index for route_subareacode...\n')

    // Create a composite index with date, subarea, and type for optimal LMTD query performance
    const startTime = Date.now()

    await pool.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_subarea_type
      ON flat_daily_sales_report (trx_trxdate, route_subareacode, trx_trxtype)
      WHERE trx_trxtype = 1 AND route_subareacode IS NOT NULL
    `)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log(`✅ Index created successfully in ${duration} seconds`)
    console.log('\nIndex Details:')
    console.log('  Name: idx_flat_sales_date_subarea_type')
    console.log('  Columns: (trx_trxdate, route_subareacode, trx_trxtype)')
    console.log('  Type: BTREE')
    console.log('  Condition: WHERE trx_trxtype = 1 AND route_subareacode IS NOT NULL')
    console.log('  Created: CONCURRENTLY (no table locking)')

    // Also create a simple index for route_subareacode alone
    console.log('\n🔨 Creating simple index for route_subareacode...\n')

    const startTime2 = Date.now()

    await pool.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_route_subarea
      ON flat_daily_sales_report (route_subareacode)
      WHERE route_subareacode IS NOT NULL
    `)

    const duration2 = ((Date.now() - startTime2) / 1000).toFixed(2)

    console.log(`✅ Simple index created successfully in ${duration2} seconds`)
    console.log('\nIndex Details:')
    console.log('  Name: idx_flat_sales_route_subarea')
    console.log('  Columns: (route_subareacode)')
    console.log('  Type: BTREE')
    console.log('  Condition: WHERE route_subareacode IS NOT NULL')

    // Verify indexes were created
    console.log('\n🔍 Verifying indexes...\n')

    const verification = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'flat_daily_sales_report'
        AND (indexname = 'idx_flat_sales_date_subarea_type' OR indexname = 'idx_flat_sales_route_subarea')
      ORDER BY indexname
    `)

    if (verification.rows.length > 0) {
      console.log('✅ Indexes verified:\n')
      verification.rows.forEach(idx => {
        console.log(`${idx.indexname}:`)
        console.log(`  ${idx.indexdef}\n`)
      })
    } else {
      console.log('⚠️  Warning: Could not verify indexes (they may still be building)')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('\nFull error:', error)
  } finally {
    await pool.end()
    console.log('\n🔌 Connection pool closed')
  }
}

createSubareaIndex()

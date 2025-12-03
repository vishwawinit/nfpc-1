const { Pool } = require('pg')
require('dotenv').config()

async function killRunningQueries() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    console.log('🔍 Checking for running queries...\n')

    // Get all active queries (excluding this connection)
    const activeQueries = await pool.query(`
      SELECT
        pid,
        usename,
        application_name,
        state,
        query_start,
        NOW() - query_start as duration,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE state = 'active'
        AND pid != pg_backend_pid()
        AND datname = $1
        AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start
    `, [process.env.DB_NAME])

    if (activeQueries.rows.length === 0) {
      console.log('✅ No active queries found!\n')
      return
    }

    console.log(`Found ${activeQueries.rows.length} active queries:\n`)
    activeQueries.rows.forEach((q, i) => {
      console.log(`${i + 1}. PID: ${q.pid}`)
      console.log(`   User: ${q.usename}`)
      console.log(`   App: ${q.application_name}`)
      console.log(`   Duration: ${q.duration}`)
      console.log(`   Query: ${q.query_preview}...`)
      console.log('')
    })

    // Kill all active queries
    console.log('🔪 Killing all active queries...\n')

    for (const q of activeQueries.rows) {
      try {
        await pool.query(`SELECT pg_terminate_backend($1)`, [q.pid])
        console.log(`✅ Killed PID ${q.pid}`)
      } catch (error) {
        console.log(`❌ Failed to kill PID ${q.pid}: ${error.message}`)
      }
    }

    console.log('\n✅ All queries terminated!')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

killRunningQueries()

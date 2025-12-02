const { Pool } = require('pg')
require('dotenv').config()

async function checkAndKillSlowQueries() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    console.log('🔍 Checking for slow/lagging database queries...\n')

    // Get all active queries with their duration
    const activeQueries = await pool.query(`
      SELECT
        pid,
        usename,
        application_name,
        client_addr,
        state,
        state_change,
        query_start,
        NOW() - query_start AS duration,
        wait_event_type,
        wait_event,
        query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state != 'idle'
      ORDER BY query_start ASC
    `)

    console.log(`📊 Found ${activeQueries.rows.length} active queries\n`)

    if (activeQueries.rows.length === 0) {
      console.log('✅ No active queries found. Database is clean!')
      await pool.end()
      return
    }

    // Categorize queries by duration
    const slowQueries = []
    const normalQueries = []

    activeQueries.rows.forEach(query => {
      const durationMs = query.duration ?
        (query.duration.hours || 0) * 3600000 +
        (query.duration.minutes || 0) * 60000 +
        (query.duration.seconds || 0) * 1000 : 0

      const queryInfo = {
        ...query,
        durationMs,
        durationFormatted: formatDuration(query.duration)
      }

      // Consider queries running for more than 2 minutes as "slow"
      if (durationMs > 120000) {
        slowQueries.push(queryInfo)
      } else {
        normalQueries.push(queryInfo)
      }
    })

    // Display slow queries
    if (slowQueries.length > 0) {
      console.log(`⚠️  Found ${slowQueries.length} SLOW/LAGGING queries:\n`)
      slowQueries.forEach((q, index) => {
        console.log(`${index + 1}. 🐌 SLOW QUERY (PID: ${q.pid})`)
        console.log(`   User: ${q.usename}`)
        console.log(`   App: ${q.application_name}`)
        console.log(`   Duration: ${q.durationFormatted}`)
        console.log(`   State: ${q.state}`)
        console.log(`   Wait Event: ${q.wait_event_type}/${q.wait_event}`)
        console.log(`   Query: ${q.query?.substring(0, 150)}...`)
        console.log('')
      })
    }

    // Display normal queries
    if (normalQueries.length > 0) {
      console.log(`✅ Found ${normalQueries.length} normal queries:\n`)
      normalQueries.forEach((q, index) => {
        console.log(`${index + 1}. ⚡ Normal (PID: ${q.pid}) - Duration: ${q.durationFormatted}`)
        console.log(`   Query: ${q.query?.substring(0, 100)}...`)
        console.log('')
      })
    }

    // Ask to kill slow queries
    if (slowQueries.length > 0) {
      console.log(`\n🔪 Killing ${slowQueries.length} slow/lagging queries...\n`)

      let killedCount = 0
      for (const query of slowQueries) {
        try {
          await pool.query(`SELECT pg_terminate_backend($1)`, [query.pid])
          console.log(`✅ Killed PID ${query.pid} (Duration: ${query.durationFormatted})`)
          killedCount++
        } catch (err) {
          console.log(`❌ Failed to kill PID ${query.pid}: ${err.message}`)
        }
      }

      console.log(`\n✅ Successfully terminated ${killedCount} slow queries`)
    } else {
      console.log('✅ No slow queries found. All queries are running normally!')
    }

    // Final check
    const finalCheck = await pool.query(`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state != 'idle'
    `)

    console.log(`\n📊 Remaining active queries: ${finalCheck.rows[0].count}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await pool.end()
    console.log('\n🔌 Connection pool closed')
  }
}

function formatDuration(interval) {
  if (!interval) return '0s'

  const hours = interval.hours || 0
  const minutes = interval.minutes || 0
  const seconds = Math.floor(interval.seconds || 0)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

// Run the check
console.log('='.repeat(80))
console.log('🔍 Database Query Monitor & Cleanup Tool')
console.log('='.repeat(80))
console.log('')

checkAndKillSlowQueries()

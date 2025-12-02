const { Pool } = require('pg')
require('dotenv').config()

async function killAllConnections() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    console.log('🔴 Killing all database connections and queries...')

    // Get all active connections
    const activeConnections = await pool.query(`
      SELECT pid, usename, application_name, state, query
      FROM pg_stat_activity
      WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    `)

    console.log(`\n📊 Found ${activeConnections.rows.length} active connections:\n`)
    activeConnections.rows.forEach(conn => {
      console.log(`  PID: ${conn.pid} | User: ${conn.usename} | App: ${conn.application_name} | State: ${conn.state}`)
      console.log(`  Query: ${conn.query?.substring(0, 100)}...\n`)
    })

    // Kill all connections except our own
    const result = await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    `)

    console.log(`\n✅ Terminated ${result.rows.length} connections`)

    // Check for any remaining active queries
    const remaining = await pool.query(`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      AND pid <> pg_backend_pid()
    `)

    console.log(`\n📊 Remaining active connections: ${remaining.rows[0].count}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
    console.log('\n🔌 Connection pool closed')
  }
}

killAllConnections()

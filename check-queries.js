const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

async function checkActiveQueries() {
  try {
    // Get active queries grouped by state
    const result = await pool.query(`
      SELECT
        state,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
      FROM pg_stat_activity
      WHERE datname = $1
      GROUP BY state
      ORDER BY count DESC
    `, [process.env.DB_NAME]);

    console.log('\n=== Active Database Queries ===');
    console.log(`Database: ${process.env.DB_NAME}`);
    console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}\n`);

    let totalQueries = 0;
    result.rows.forEach(row => {
      console.log(`State: ${row.state || 'NULL'}`);
      console.log(`  Total: ${row.count}`);
      console.log(`  Waiting: ${row.waiting}\n`);
      totalQueries += parseInt(row.count);
    });

    console.log(`Total Active Connections: ${totalQueries}\n`);

    // Get detailed info about active queries
    const detailResult = await pool.query(`
      SELECT
        pid,
        usename,
        application_name,
        state,
        wait_event_type,
        wait_event,
        EXTRACT(EPOCH FROM (now() - query_start)) as duration_seconds,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE datname = $1
        AND state != 'idle'
        AND pid != pg_backend_pid()
      ORDER BY query_start DESC
      LIMIT 20
    `, [process.env.DB_NAME]);

    if (detailResult.rows.length > 0) {
      console.log('=== Currently Active Queries (Non-Idle) ===\n');
      detailResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. PID: ${row.pid} | User: ${row.usename} | State: ${row.state}`);
        const duration = row.duration_seconds ? parseFloat(row.duration_seconds).toFixed(2) : '0.00';
        console.log(`   Duration: ${duration}s`);
        if (row.wait_event_type) {
          console.log(`   Waiting on: ${row.wait_event_type} - ${row.wait_event}`);
        }
        console.log(`   Query: ${row.query_preview}...`);
        console.log('');
      });
    } else {
      console.log('No active non-idle queries found.\n');
    }

    await pool.end();
  } catch (error) {
    console.error('Error checking queries:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkActiveQueries();

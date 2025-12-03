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

async function killLongRunningQueries() {
  try {
    // Get long-running queries (over 60 seconds and not idle)
    const longQueries = await pool.query(`
      SELECT
        pid,
        usename,
        state,
        EXTRACT(EPOCH FROM (now() - query_start)) as duration_seconds,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE datname = $1
        AND state != 'idle'
        AND pid != pg_backend_pid()
        AND query_start < now() - interval '60 seconds'
      ORDER BY query_start ASC
    `, [process.env.DB_NAME]);

    if (longQueries.rows.length === 0) {
      console.log('No long-running queries found to kill.');
      await pool.end();
      return;
    }

    console.log(`\nFound ${longQueries.rows.length} long-running queries to terminate:\n`);

    for (const row of longQueries.rows) {
      const duration = parseFloat(row.duration_seconds).toFixed(2);
      console.log(`Killing PID ${row.pid} (Duration: ${duration}s)`);
      console.log(`  User: ${row.usename} | State: ${row.state}`);
      console.log(`  Query: ${row.query_preview}...\n`);

      // Terminate the backend process
      const result = await pool.query(
        'SELECT pg_terminate_backend($1) as terminated',
        [row.pid]
      );

      if (result.rows[0].terminated) {
        console.log(`✓ Successfully terminated PID ${row.pid}\n`);
      } else {
        console.log(`✗ Failed to terminate PID ${row.pid}\n`);
      }
    }

    console.log('Done!\n');
    await pool.end();
  } catch (error) {
    console.error('Error killing queries:', error.message);
    await pool.end();
    process.exit(1);
  }
}

killLongRunningQueries();

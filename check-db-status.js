const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

async function checkDatabaseStatus() {
  try {
    console.log('🔍 Checking PostgreSQL Database Status...\n');
    console.log(`Connected to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);

    // Check active queries
    const activeQuery = `
      SELECT
        pid,
        usename,
        application_name,
        state,
        query_start,
        now() - query_start AS duration,
        wait_event_type,
        wait_event,
        LEFT(query, 150) AS query_preview
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND pid != pg_backend_pid()
      ORDER BY query_start;
    `;

    const activeResult = await pool.query(activeQuery);

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 ACTIVE QUERIES');
    console.log('═══════════════════════════════════════════════════════');

    if (activeResult.rows.length === 0) {
      console.log('✅ No active queries running (good!)\n');
    } else {
      console.log(`⚠️  Found ${activeResult.rows.length} active queries:\n`);
      activeResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. PID: ${row.pid} | User: ${row.usename} | State: ${row.state}`);
        console.log(`   Duration: ${row.duration}`);
        console.log(`   Wait Event: ${row.wait_event_type} - ${row.wait_event || 'None'}`);
        console.log(`   Query: ${row.query_preview}`);
        console.log('');
      });
    }

    // Check index creation progress
    const progressQuery = `
      SELECT
        p.phase,
        p.blocks_total,
        p.blocks_done,
        ROUND(100.0 * p.blocks_done / NULLIF(p.blocks_total, 0), 2) AS blocks_pct,
        p.tuples_total,
        p.tuples_done,
        ROUND(100.0 * p.tuples_done / NULLIF(p.tuples_total, 0), 2) AS tuples_pct,
        a.query_start,
        now() - a.query_start AS duration
      FROM pg_stat_progress_create_index p
      JOIN pg_stat_activity a ON a.pid = p.pid;
    `;

    const progressResult = await pool.query(progressQuery);

    console.log('═══════════════════════════════════════════════════════');
    console.log('📈 INDEX CREATION PROGRESS');
    console.log('═══════════════════════════════════════════════════════');

    if (progressResult.rows.length === 0) {
      console.log('❌ No index creation in progress\n');
    } else {
      progressResult.rows.forEach(row => {
        console.log(`Phase: ${row.phase}`);
        console.log(`Tuples: ${parseInt(row.tuples_done || 0).toLocaleString()} / ${parseInt(row.tuples_total || 0).toLocaleString()} (${row.tuples_pct || 0}%)`);
        console.log(`Blocks: ${parseInt(row.blocks_done || 0).toLocaleString()} / ${parseInt(row.blocks_total || 0).toLocaleString()} (${row.blocks_pct || 0}%)`);
        console.log(`Duration: ${row.duration}\n`);
      });
    }

    // Check for blocking locks
    const blockingQuery = `
      SELECT
        locktype,
        relation::regclass AS table_name,
        mode,
        granted,
        pid,
        pg_blocking_pids(pid) as blocked_by
      FROM pg_locks
      WHERE NOT granted
      ORDER BY pid;
    `;

    const blockingResult = await pool.query(blockingQuery);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔒 BLOCKED QUERIES (LOCKS)');
    console.log('═══════════════════════════════════════════════════════');

    if (blockingResult.rows.length === 0) {
      console.log('✅ No blocked queries (good!)\n');
    } else {
      console.log(`⚠️  Found ${blockingResult.rows.length} blocked queries:\n`);
      blockingResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Table: ${row.table_name} | Mode: ${row.mode}`);
        console.log(`   PID: ${row.pid} | Blocked by PIDs: ${row.blocked_by}`);
        console.log('');
      });
    }

    // Check connection stats
    const connQuery = `
      SELECT
        COUNT(*) as total_connections,
        COUNT(*) FILTER (WHERE state = 'active') as active,
        COUNT(*) FILTER (WHERE state = 'idle') as idle,
        COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
        COUNT(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
      FROM pg_stat_activity;
    `;

    const connResult = await pool.query(connQuery);
    const stats = connResult.rows[0];

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔌 CONNECTION STATISTICS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Connections: ${stats.total_connections}`);
    console.log(`Active: ${stats.active}`);
    console.log(`Idle: ${stats.idle}`);
    console.log(`Idle in Transaction: ${stats.idle_in_transaction}`);
    console.log(`Waiting: ${stats.waiting}\n`);

    // Check existing indexes
    const indexQuery = `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'flat_daily_sales_report'
        AND indexname LIKE 'idx_sales%'
      ORDER BY indexname;
    `;

    const indexResult = await pool.query(indexQuery);

    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 EXISTING INDEXES');
    console.log('═══════════════════════════════════════════════════════');

    if (indexResult.rows.length === 0) {
      console.log('❌ No performance indexes created yet\n');
    } else {
      console.log(`✅ Found ${indexResult.rows.length} index(es):\n`);
      indexResult.rows.forEach(row => {
        console.log(`   - ${row.indexname}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabaseStatus();

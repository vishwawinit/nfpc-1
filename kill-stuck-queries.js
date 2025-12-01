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

async function killStuckQueries() {
  try {
    console.log('🔪 Killing stuck queries...\n');

    const pidsToKill = [125397, 125407, 127251, 127275, 128146, 128151, 128417, 128431, 128690, 128708, 129931, 129934];

    for (const pid of pidsToKill) {
      try {
        const result = await pool.query('SELECT pg_terminate_backend($1)', [pid]);
        if (result.rows[0].pg_terminate_backend) {
          console.log(`✅ Killed PID ${pid}`);
        } else {
          console.log(`⚠️  PID ${pid} - already gone or couldn't kill`);
        }
      } catch (err) {
        console.log(`❌ PID ${pid} - Error: ${err.message}`);
      }
    }

    console.log('\n✅ Cleanup complete!\n');

    // Check remaining active queries
    const checkQuery = `
      SELECT
        COUNT(*) as active_queries
      FROM pg_stat_activity
      WHERE state = 'active'
        AND pid != pg_backend_pid();
    `;

    const checkResult = await pool.query(checkQuery);
    console.log(`📊 Remaining active queries: ${checkResult.rows[0].active_queries}\n`);

    // Check index creation status
    const progressQuery = `
      SELECT
        phase,
        ROUND(100.0 * blocks_done / NULLIF(blocks_total, 0), 2) AS blocks_pct
      FROM pg_stat_progress_create_index;
    `;

    const progressResult = await pool.query(progressQuery);
    if (progressResult.rows.length > 0) {
      console.log('📈 Index creation status:');
      console.log(`   Phase: ${progressResult.rows[0].phase}`);
      console.log(`   Progress: ${progressResult.rows[0].blocks_pct}%\n`);
    } else {
      console.log('✅ Index creation completed or not running\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

killStuckQueries();

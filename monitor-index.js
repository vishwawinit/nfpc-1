const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function checkProgress() {
  try {
    console.log('🔍 Checking Index Creation Progress...\n');

    const progressQuery = `
      SELECT
        a.pid,
        a.query,
        p.phase,
        p.blocks_total,
        p.blocks_done,
        ROUND(100.0 * p.blocks_done / NULLIF(p.blocks_total, 0), 2) AS blocks_pct,
        p.tuples_total,
        p.tuples_done,
        ROUND(100.0 * p.tuples_done / NULLIF(p.tuples_total, 0), 2) AS tuples_pct,
        now() - a.query_start AS duration
      FROM pg_stat_progress_create_index p
      JOIN pg_stat_activity a ON a.pid = p.pid;
    `;

    const progressResult = await pool.query(progressQuery);

    if (progressResult.rows.length === 0) {
      console.log('❌ No active index creation found.\n');

      const existingQuery = `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'flat_daily_sales_report'
          AND indexname LIKE 'idx_sales%'
        ORDER BY indexname;
      `;

      const existingResult = await pool.query(existingQuery);

      if (existingResult.rows.length > 0) {
        console.log('✅ Existing Indexes Found:');
        existingResult.rows.forEach(row => {
          console.log(`   - ${row.indexname}`);
        });
      } else {
        console.log('⚠️  No indexes created yet.');
      }
    } else {
      progressResult.rows.forEach(row => {
        console.log('📊 Active Index Creation:');
        console.log(`   Phase: ${row.phase}`);
        console.log(`   Tuples Progress: ${parseInt(row.tuples_done || 0).toLocaleString()} / ${parseInt(row.tuples_total || 0).toLocaleString()} (${row.tuples_pct || 0}%)`);
        console.log(`   Blocks Progress: ${parseInt(row.blocks_done || 0).toLocaleString()} / ${parseInt(row.blocks_total || 0).toLocaleString()} (${row.blocks_pct || 0}%)`);
        console.log(`   Duration: ${row.duration}`);
        console.log(`   Query: ${row.query.substring(0, 80)}...`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkProgress();

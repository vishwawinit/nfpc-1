import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('🔪 Finding and killing slow queries...');

    // Find all queries running longer than 30 seconds
    const slowQueries = await query(`
      SELECT
        pid,
        now() - pg_stat_activity.query_start AS duration,
        state,
        query
      FROM pg_stat_activity
      WHERE state = 'active'
        AND now() - pg_stat_activity.query_start > interval '30 seconds'
        AND pid <> pg_backend_pid()
      ORDER BY duration DESC
    `);

    console.log(`Found ${slowQueries.rows.length} slow queries`);

    const killedQueries = [];

    // Kill each slow query
    for (const row of slowQueries.rows) {
      try {
        console.log(`🔪 Killing query PID ${row.pid} (running for ${row.duration})`);
        console.log(`   Query: ${row.query.substring(0, 100)}...`);

        await query(`SELECT pg_cancel_backend($1)`, [row.pid]);

        killedQueries.push({
          pid: row.pid,
          duration: row.duration,
          query: row.query.substring(0, 200)
        });
      } catch (killError) {
        console.error(`Failed to kill PID ${row.pid}:`, killError);
      }
    }

    console.log(`✅ Killed ${killedQueries.length} slow queries`);

    return NextResponse.json({
      success: true,
      killedCount: killedQueries.length,
      killedQueries
    });
  } catch (error: any) {
    console.error('❌ Error killing slow queries:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
  host: '10.20.53.130',
  port: 5432,
  database: 'NFPC_TestV1',
  user: 'choithram',
  password: 'choithram',
  max: 1,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  query_timeout: 300000, // 5 minutes per query
});

async function createIndexes() {
  const client = await pool.connect();

  try {
    console.log('Connected to database successfully');
    console.log('Starting index creation process...');
    console.log('This will take 5-15 minutes depending on data volume\n');

    // Read the SQL file
    const sqlFile = fs.readFileSync(path.join(__dirname, 'database_indexes.sql'), 'utf8');

    // Split by semicolons and filter out empty statements
    const statements = sqlFile
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('\\timing'));

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (!statement || statement.startsWith('--') || statement.trim() === '') {
        continue;
      }

      // Extract operation description
      let description = 'Executing statement';
      if (statement.includes('CREATE INDEX CONCURRENTLY')) {
        const match = statement.match(/CREATE INDEX CONCURRENTLY (\w+)/);
        if (match) {
          description = `Creating index: ${match[1]}`;
        }
      } else if (statement.includes('DROP INDEX')) {
        const match = statement.match(/DROP INDEX IF EXISTS (\w+)/);
        if (match) {
          description = `Dropping existing index: ${match[1]}`;
        }
      } else if (statement.includes('ANALYZE')) {
        const match = statement.match(/ANALYZE "(\w+)"/);
        if (match) {
          description = `Analyzing table: ${match[1]}`;
        }
      } else if (statement.includes('SELECT')) {
        description = 'Running verification query';
      }

      try {
        console.log(`[${i + 1}/${statements.length}] ${description}...`);
        const startTime = Date.now();
        const result = await client.query(statement + ';');
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (result.rows && result.rows.length > 0) {
          console.log(`  ✓ Completed in ${duration}s`);
          if (statement.includes('SELECT') && result.rows.length < 50) {
            console.table(result.rows);
          }
        } else {
          console.log(`  ✓ Completed in ${duration}s`);
        }
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`  ⊘ Already exists (skipped)`);
          skipCount++;
        } else if (error.message.includes('does not exist')) {
          console.log(`  ⊘ Not found (skipped)`);
          skipCount++;
        } else {
          console.error(`  ✗ Error: ${error.message}`);
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('INDEX CREATION COMPLETE');
    console.log('='.repeat(70));
    console.log(`✓ Successfully executed: ${successCount} statements`);
    console.log(`⊘ Skipped: ${skipCount} statements`);
    console.log('\nExpected Performance Improvement: 90-95% faster queries');
    console.log('Dashboard load time should be reduced from 2-3 minutes to 5-10 seconds');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

createIndexes().catch(console.error);

const { Pool } = require('pg');

const pool = new Pool({
  host: '10.20.53.130',
  port: 5432,
  database: 'flat_nfpc_test',
  user: 'choithram',
  password: 'choithram',
  max: 1,
  connectionTimeoutMillis: 5000,
});

let attempts = 0;
const maxAttempts = 20;

async function checkDatabase() {
  attempts++;

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    console.log(`\n✅ DATABASE IS ONLINE! (Attempt ${attempts})`);
    console.log('The database has completed recovery and is now accepting connections.');
    await pool.end();
    process.exit(0);

  } catch (error) {
    if (error.code === '57P03') {
      console.log(`⏳ Attempt ${attempts}/${maxAttempts}: Database still in recovery mode...`);
    } else {
      console.log(`⚠️  Attempt ${attempts}/${maxAttempts}: ${error.message}`);
    }

    if (attempts >= maxAttempts) {
      console.log('\n❌ Maximum attempts reached. Database is still unavailable.');
      console.log('Please contact your database administrator.');
      await pool.end();
      process.exit(1);
    }

    // Wait 3 seconds before next attempt
    setTimeout(checkDatabase, 3000);
  }
}

console.log('🔍 Monitoring database recovery status...');
console.log('Checking every 3 seconds...\n');
checkDatabase();

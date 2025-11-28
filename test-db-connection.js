const { Pool } = require('pg');

// Database configuration from .env
const pool = new Pool({
  host: '10.20.53.130',
  port: 5432,
  database: 'flat_nfpc_test',
  user: 'choithram',
  password: 'choithram',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  console.log('🔍 Testing PostgreSQL Database Connection...\n');
  console.log('Configuration:');
  console.log(`  Host: 10.20.53.130`);
  console.log(`  Port: 5432`);
  console.log(`  Database: flat_nfpc_test`);
  console.log(`  User: choithram\n`);

  try {
    console.log('⏳ Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Connection established successfully!\n');

    console.log('🔍 Testing query execution...');
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Query executed successfully!');
    console.log(`  Current Time: ${result.rows[0].current_time}`);
    console.log(`  PostgreSQL Version: ${result.rows[0].pg_version}\n`);

    console.log('🔍 Checking flat_daily_sales_report table...');
    const tableCheck = await client.query(`
      SELECT COUNT(*) as row_count
      FROM flat_daily_sales_report
      LIMIT 1
    `);
    console.log(`✅ Table exists and accessible`);
    console.log(`  Estimated rows: ${tableCheck.rows[0].row_count}\n`);

    client.release();
    await pool.end();

    console.log('✅ All checks passed! Database connection is working properly.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Database Connection Failed!\n');
    console.error('Error Details:');
    console.error(`  Message: ${error.message}`);
    console.error(`  Code: ${error.code || 'N/A'}`);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Possible issues:');
      console.error('  - Database server is not running');
      console.error('  - Wrong host or port');
      console.error('  - Firewall blocking connection');
    } else if (error.code === '28P01') {
      console.error('\n💡 Possible issues:');
      console.error('  - Incorrect username or password');
      console.error('  - User does not have access to database');
    } else if (error.code === '3D000') {
      console.error('\n💡 Possible issues:');
      console.error('  - Database does not exist');
      console.error('  - Wrong database name');
    } else if (error.code === '57P03') {
      console.error('\n💡 Database is in recovery mode');
      console.error('  - Wait for database recovery to complete');
      console.error('  - Contact database administrator');
    }

    await pool.end();
    process.exit(1);
  }
}

testConnection();

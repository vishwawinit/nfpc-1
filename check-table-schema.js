const { Pool } = require('pg')
require('dotenv').config()

async function checkTableSchema() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  })

  try {
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'flat_daily_sales_report'
      ORDER BY ordinal_position
    `)

    console.log('📋 Table Schema for flat_daily_sales_report:\n')
    console.log('Total Columns:', columns.rows.length)
    console.log('\nColumns:\n')

    columns.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(40)} | Type: ${col.data_type.padEnd(20)} | Nullable: ${col.is_nullable}`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkTableSchema()

import { db } from '../src/lib/database'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function createIndexes() {
  try {
    console.log('🔌 Connecting to database...')
    console.log('DB Config:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      passwordSet: !!process.env.DB_PASSWORD
    })
    await db.initialize()

    console.log('📖 Reading SQL file...')
    const sqlFile = path.join(process.cwd(), 'create_indexes.sql')
    const sql = fs.readFileSync(sqlFile, 'utf8')

    // Split by semicolons and filter out comments
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement) continue

      // Extract index name from CREATE INDEX statement
      const match = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/)
      const indexName = match ? match[1] : `Statement ${i + 1}`

      console.log(`⏳ Creating: ${indexName}...`)
      const start = Date.now()

      try {
        await db.query(statement)
        const duration = ((Date.now() - start) / 1000).toFixed(2)
        console.log(`✅ ${indexName} created in ${duration}s`)
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(`ℹ️  ${indexName} already exists, skipping`)
        } else {
          console.error(`❌ Error creating ${indexName}:`, error.message)
        }
      }
    }

    console.log('\n✨ Index creation complete!')
    console.log('\n📊 Analyzing table...')
    await db.query('ANALYZE flat_daily_sales_report')
    console.log('✅ Table analyzed')

    console.log('\n📏 Checking index sizes...')
    const result = await db.query(`
      SELECT
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
      FROM pg_indexes
      WHERE tablename = 'flat_daily_sales_report'
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `)

    console.log('\nIndex Sizes:')
    result.rows.forEach((row: any) => {
      console.log(`  ${row.indexname}: ${row.index_size}`)
    })

    await db.close()
    console.log('\n🎉 All done!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

createIndexes()

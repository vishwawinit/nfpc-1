import { db } from '../src/lib/database'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function createChatTables() {
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

    console.log('📖 Reading chat migration SQL file...')
    const sqlFile = path.join(process.cwd(), 'src', 'app', 'db', 'migrations', 'create-chat-history.sql')
    const sql = fs.readFileSync(sqlFile, 'utf8')

    console.log('📝 Executing migration SQL...\n')
    const start = Date.now()

    try {
      // Execute the entire SQL file at once to handle functions/triggers properly
      await db.query(sql)
      const duration = ((Date.now() - start) / 1000).toFixed(2)
      console.log(`✅ Migration completed in ${duration}s`)
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`ℹ️  Tables already exist, skipping`)
      } else {
        console.error(`❌ Error executing migration:`, error.message)
        throw error
      }
    }

    console.log('\n✨ Chat tables migration completed successfully!')
    console.log('📊 Tables created:')
    console.log('   - conversations')
    console.log('   - messages')

    await db.close()
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

createChatTables()

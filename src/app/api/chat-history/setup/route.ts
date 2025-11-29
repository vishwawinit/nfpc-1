import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Create conversations table
    await query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(255),
        message_count INTEGER DEFAULT 0
      )
    `);

    // Create messages table
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        chart_data JSONB,
        chart_config JSONB,
        charts JSONB,
        table_data JSONB,
        sql_query TEXT,
        sql_queries TEXT[],
        datasets JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        order_index INTEGER NOT NULL,
        CONSTRAINT fk_conversation
          FOREIGN KEY(conversation_id) 
          REFERENCES conversations(id)
          ON DELETE CASCADE
      )
    `);

    // Create indexes
    await query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC)
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(conversation_id, order_index)
    `);

    // Create update function
    await query(`
      CREATE OR REPLACE FUNCTION update_conversation_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE conversations 
        SET updated_at = CURRENT_TIMESTAMP,
            message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.conversation_id)
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger
    await query(`
      DROP TRIGGER IF EXISTS trigger_update_conversation ON messages
    `);
    
    await query(`
      CREATE TRIGGER trigger_update_conversation
        AFTER INSERT OR UPDATE ON messages
        FOR EACH ROW
        EXECUTE FUNCTION update_conversation_timestamp()
    `);

    return NextResponse.json({ 
      success: true, 
      message: 'Database tables created successfully' 
    });
  } catch (error: any) {
    console.error('Error setting up database:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


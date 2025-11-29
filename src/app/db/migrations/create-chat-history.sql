-- Chat Conversations History Tables
-- Run this SQL in your PostgreSQL database

-- Table to store conversation metadata
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id VARCHAR(255), -- Add user authentication later if needed
  message_count INTEGER DEFAULT 0
);

-- Table to store individual messages in conversations
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  
  -- Store chart data for visualization
  chart_data JSONB,
  chart_config JSONB,
  charts JSONB, -- Array of multiple charts
  
  -- Store table data from SQL queries
  table_data JSONB,
  
  -- Store SQL queries executed
  sql_query TEXT,
  sql_queries TEXT[], -- Array of multiple queries
  
  -- Store multiple datasets for complex queries
  datasets JSONB,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  order_index INTEGER NOT NULL,
  
  CONSTRAINT fk_conversation
    FOREIGN KEY(conversation_id) 
    REFERENCES conversations(id)
    ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(conversation_id, order_index);

-- Function to update conversation updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations 
  SET updated_at = CURRENT_TIMESTAMP,
      message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.conversation_id)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation timestamp when message is added
DROP TRIGGER IF EXISTS trigger_update_conversation ON messages;
CREATE TRIGGER trigger_update_conversation
  AFTER INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Sample query to view conversations with message counts
-- SELECT id, title, message_count, created_at, updated_at 
-- FROM conversations 
-- ORDER BY updated_at DESC;


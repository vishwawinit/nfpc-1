import { query, transaction } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST - Add a message to a conversation
export async function POST(request: Request) {
  try {
    const { 
      conversationId, 
      role, 
      content, 
      chartData, 
      chartConfig, 
      charts,
      tableData, 
      sqlQuery, 
      sqlQueries,
      datasets 
    } = await request.json();

    // Get the current max order_index for this conversation
    const orderResult = await query(
      `SELECT COALESCE(MAX(order_index), -1) as max_order 
       FROM messages 
       WHERE conversation_id = $1`,
      [conversationId]
    );

    const nextOrderIndex = (orderResult.rows[0].max_order || -1) + 1;

    // Insert the new message
    const result = await query(
      `INSERT INTO messages (
        conversation_id, role, content, chart_data, chart_config, charts,
        table_data, sql_query, sql_queries, datasets, created_at, order_index
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)
      RETURNING id, created_at, order_index`,
      [
        conversationId,
        role,
        content,
        chartData ? JSON.stringify(chartData) : null,
        chartConfig ? JSON.stringify(chartConfig) : null,
        charts ? JSON.stringify(charts) : null,
        tableData ? JSON.stringify(tableData) : null,
        sqlQuery || null,
        sqlQueries ? JSON.stringify(sqlQueries) : null,
        datasets ? JSON.stringify(datasets) : null,
        nextOrderIndex
      ]
    );

    // Update conversation title if it's the first user message
    if (nextOrderIndex === 0 && role === 'user') {
      // Generate a title from the first message (max 50 chars)
      const title = content.length > 50 
        ? content.substring(0, 47) + '...' 
        : content;
      
      await query(
        `UPDATE conversations 
         SET title = $1 
         WHERE id = $2`,
        [title, conversationId]
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Error saving message:', error);
    console.error('Error details:', error.message, error.code, error.detail);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save message' },
      { status: 500 }
    );
  }
}

// PUT - Save multiple messages at once (for saving entire conversation)
export async function PUT(request: Request) {
  try {
    const { conversationId, messages } = await request.json();

    // Validate conversationId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      console.error('Invalid UUID format:', conversationId);
      return NextResponse.json(
        { success: false, error: 'Invalid conversation ID format' },
        { status: 400 }
      );
    }

    await transaction(async (client) => {
      // First, ensure conversation exists
      const convExists = await client.query(
        'SELECT id FROM conversations WHERE id = $1',
        [conversationId]
      );

      if (convExists.rows.length === 0) {
        // Create conversation if it doesn't exist
        await client.query(
          `INSERT INTO conversations (id, title, created_at, updated_at, message_count)
           VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
          [conversationId, 'New Chat']
        );
      }

      // Delete existing messages for this conversation
      await client.query(
        'DELETE FROM messages WHERE conversation_id = $1',
        [conversationId]
      );

      // Insert all messages
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        await client.query(
          `INSERT INTO messages (
            conversation_id, role, content, chart_data, chart_config, charts,
            table_data, sql_query, sql_queries, datasets, created_at, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)`,
          [
            conversationId,
            msg.role,
            msg.content,
            msg.chartData ? JSON.stringify(msg.chartData) : null,
            msg.chartConfig ? JSON.stringify(msg.chartConfig) : null,
            msg.charts ? JSON.stringify(msg.charts) : null,
            msg.tableData ? JSON.stringify(msg.tableData) : null,
            msg.sqlQuery || null,
            msg.sqlQueries ? JSON.stringify(msg.sqlQueries) : null,
            msg.datasets ? JSON.stringify(msg.datasets) : null,
            i
          ]
        );
      }

      // Update conversation title from first user message if available
      const firstUserMessage = messages.find((m: any) => m.role === 'user');
      if (firstUserMessage) {
        const title = firstUserMessage.content.length > 50 
          ? firstUserMessage.content.substring(0, 47) + '...' 
          : firstUserMessage.content;
        
        await client.query(
          `UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP, message_count = $2 WHERE id = $3`,
          [title, messages.length, conversationId]
        );
      } else {
        // Just update message count
        await client.query(
          `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, message_count = $1 WHERE id = $2`,
          [messages.length, conversationId]
        );
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Messages saved successfully' 
    });
  } catch (error: any) {
    console.error('Error saving messages:', error);
    console.error('Error details:', error.message, error.code, error.detail);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save messages' },
      { status: 500 }
    );
  }
}


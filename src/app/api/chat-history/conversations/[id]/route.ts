import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET - Get a conversation with all messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Get conversation details
    const conversationResult = await query(
      `SELECT id, title, created_at, updated_at, message_count 
       FROM conversations 
       WHERE id = $1`,
      [conversationId]
    );

    if (conversationResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get all messages for the conversation
    const messagesResult = await query(
      `SELECT id, role, content, chart_data, chart_config, charts,
              table_data, sql_query, sql_queries, datasets, created_at, order_index
       FROM messages 
       WHERE conversation_id = $1 
       ORDER BY order_index ASC`,
      [conversationId]
    );

    return NextResponse.json({ 
      success: true, 
      conversation: conversationResult.rows[0],
      messages: messagesResult.rows 
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update conversation (rename)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const { title } = await request.json();

    const result = await query(
      `UPDATE conversations 
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, title, updated_at`,
      [title, conversationId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      conversation: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


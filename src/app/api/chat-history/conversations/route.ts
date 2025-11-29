import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET - List all conversations (only show conversations with messages)
export async function GET() {
  try {
    const result = await query(`
      SELECT id, title, message_count, created_at, updated_at 
      FROM conversations 
      WHERE message_count > 0
      ORDER BY updated_at DESC
    `);

    return NextResponse.json({ 
      success: true, 
      conversations: result.rows 
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new conversation
export async function POST(request: Request) {
  try {
    const { title = 'New Chat' } = await request.json();

    const result = await query(
      `INSERT INTO conversations (title) 
       VALUES ($1) 
       RETURNING id, title, created_at, updated_at, message_count`,
      [title]
    );

    return NextResponse.json({ 
      success: true, 
      conversation: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete a conversation
export async function DELETE(request: Request) {
  try {
    const { conversationId } = await request.json();

    await query(
      `DELETE FROM conversations WHERE id = $1`,
      [conversationId]
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation deleted successfully' 
    });
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query: sqlQuery } = body;

    if (!sqlQuery || typeof sqlQuery !== 'string') {
      return NextResponse.json(
        { error: 'SQL query is required', detail: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    console.log('🔍 Executing SQL query:', sqlQuery.substring(0, 200) + '...');

    // Execute the query with a 30-second timeout
    const startTime = Date.now();
    const result = await query(sqlQuery);
    const executionTime = Date.now() - startTime;

    console.log(`✅ Query executed successfully in ${executionTime}ms`);
    console.log(`📊 Rows returned: ${result.rows?.length || 0}`);

    // Convert rows from objects to arrays for compatibility
    const columns = result.rows?.[0] ? Object.keys(result.rows[0]) : [];
    const rowsAsArrays = result.rows?.map(row => columns.map(col => row[col])) || [];

    // Return the result in the expected format
    return NextResponse.json({
      success: true,
      rows: rowsAsArrays,
      columns,
      rowCount: result.rows?.length || 0,
      executionTime,
    });
  } catch (error: any) {
    console.error('❌ SQL execution error:', error);

    // Extract meaningful error message
    let errorMessage = error.message || 'Unknown database error';
    let errorDetail = error.detail || error.hint || null;

    // PostgreSQL error codes
    const errorCode = error.code || 'UNKNOWN';

    return NextResponse.json(
      {
        error: errorMessage,
        detail: errorDetail,
        code: errorCode,
        success: false,
      },
      { status: 500 }
    );
  }
}

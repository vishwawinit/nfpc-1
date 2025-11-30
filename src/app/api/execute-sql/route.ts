import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

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

    // Execute the query with a 30-second timeout at database level
    const startTime = Date.now();

    try {
      // Set statement timeout to 5 minutes for chatbot queries
      await query('SET statement_timeout = 300000'); // 5 minutes (300 seconds)

      const result = await query(sqlQuery);
      const executionTime = Date.now() - startTime;

      // Reset timeout
      await query('SET statement_timeout = 0');

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
    } catch (queryError: any) {
      // ALWAYS reset timeout even if query fails
      try {
        await query('SET statement_timeout = 0');
      } catch (resetError) {
        console.error('⚠️ Failed to reset timeout:', resetError);
      }

      // Check if it's a timeout error
      if (queryError.code === '57014' || queryError.message?.includes('timeout')) {
        console.error('⏱️ Query timeout after 5 minutes');
        return NextResponse.json(
          {
            error: 'Query execution time exceeded 5 minutes. The dataset might be too large. Please try adding date filters or limiting the scope.',
            detail: 'The query was automatically cancelled after 5 minutes to prevent database overload.',
            code: 'QUERY_TIMEOUT',
            success: false,
          },
          { status: 408 } // 408 Request Timeout
        );
      }

      // Re-throw for general error handler
      throw queryError;
    }
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

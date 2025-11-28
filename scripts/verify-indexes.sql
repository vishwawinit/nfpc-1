-- ============================================================================
-- LMTD Index Verification and Performance Diagnostic Script
-- ============================================================================
-- Run this script to verify indexes exist and are being used
-- ============================================================================

-- Step 1: Check if indexes exist
\echo '========================================='
\echo 'Step 1: Checking for LMTD indexes...'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
    AND indexname LIKE 'idx_flat_sales%'
ORDER BY indexname;

\echo ''
\echo 'Expected: 7 indexes starting with idx_flat_sales'
\echo ''

-- Step 2: Check table statistics
\echo '========================================='
\echo 'Step 2: Table statistics...'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    n_live_tup as row_count,
    last_vacuum,
    last_analyze
FROM pg_stat_user_tables
WHERE tablename = 'flat_daily_sales_report';

\echo ''

-- Step 3: Force statistics update if needed
\echo '========================================='
\echo 'Step 3: Updating table statistics...'
\echo '========================================='

ANALYZE flat_daily_sales_report;

\echo 'Statistics updated!'
\echo ''

-- Step 4: Test query performance with EXPLAIN ANALYZE
\echo '========================================='
\echo 'Step 4: Testing query performance...'
\echo '========================================='
\echo 'Query 1: MTD data (should use index scan)'
\echo ''

EXPLAIN ANALYZE
SELECT
    trx_usercode,
    customer_code,
    line_itemcode,
    COUNT(*) as records,
    SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2025-11-01'::timestamp
    AND trx_trxdate < '2025-11-30'::timestamp
    AND trx_trxtype = 1
GROUP BY trx_usercode, customer_code, line_itemcode
LIMIT 100;

\echo ''
\echo '========================================='
\echo 'IMPORTANT: Check the output above!'
\echo '========================================='
\echo 'Look for "Index Scan" or "Bitmap Index Scan"'
\echo 'If you see "Seq Scan", indexes are NOT being used!'
\echo ''

-- Step 5: Check for missing indexes on trx_trxdate
\echo '========================================='
\echo 'Step 5: All indexes on flat_daily_sales_report'
\echo '========================================='

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
ORDER BY indexname;

\echo ''
\echo '========================================='
\echo 'Diagnostic Complete!'
\echo '========================================='

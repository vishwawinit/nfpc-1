-- ==========================================
-- DIAGNOSE AND FIX LMTD INDEX ISSUES
-- ==========================================
-- Run this to diagnose why indexes aren't being used
-- and create the correct indexes
-- ==========================================

-- Step 1: Check which indexes exist
SELECT
    '=== EXISTING INDEXES ===' as info;

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
    indexdef
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
ORDER BY indexname;

-- Step 2: Check table statistics
SELECT
    '=== TABLE STATISTICS ===' as info;

SELECT
    schemaname,
    tablename,
    last_analyze,
    last_autoanalyze,
    n_live_tup as row_count,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE tablename = 'flat_daily_sales_report';

-- Step 3: Test if index is being used (MTD query)
SELECT
    '=== MTD QUERY PLAN ===' as info;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2024-11-01'::date
  AND trx_trxdate <= '2024-11-30'::date
  AND trx_trxtype = 1;

-- Step 4: Test with user filter
SELECT
    '=== USER FILTER QUERY PLAN ===' as info;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2024-11-01'::date
  AND trx_trxdate <= '2024-11-30'::date
  AND trx_trxtype = 1
  AND trx_usercode = '187219';

-- Step 5: Update statistics (CRITICAL - run this!)
SELECT
    '=== UPDATING STATISTICS ===' as info;

ANALYZE flat_daily_sales_report;

SELECT
    'Statistics updated successfully!' as result;

-- Step 6: Create missing critical indexes if they don't exist
SELECT
    '=== CREATING MISSING INDEXES ===' as info;

-- Critical index #1: Date + Type (most important for LMTD queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_type_only
ON flat_daily_sales_report(trx_trxdate, trx_trxtype)
WHERE trx_trxtype = 1;

-- Critical index #2: Date + User + Type (for user-filtered queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_user_type
ON flat_daily_sales_report(trx_trxdate, trx_usercode, trx_trxtype)
WHERE trx_trxtype = 1;

-- Critical index #3: User + Customer + Product (for GROUP BY)
-- Only create if it doesn't exist
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_user_cust_prod_combo
ON flat_daily_sales_report(trx_usercode, customer_code, line_itemcode, trx_trxdate)
WHERE trx_trxtype = 1;

SELECT
    'Indexes created successfully!' as result;

-- Step 7: Update statistics again after creating indexes
ANALYZE flat_daily_sales_report;

-- Step 8: Verify indexes are now being used
SELECT
    '=== VERIFY INDEX USAGE (AFTER FIX) ===' as info;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2024-11-01'::date
  AND trx_trxdate <= '2024-11-30'::date
  AND trx_trxtype = 1;

-- Step 9: Check planner settings
SELECT
    '=== PLANNER SETTINGS ===' as info;

SELECT name, setting, unit, short_desc
FROM pg_settings
WHERE name IN (
    'enable_indexscan',
    'enable_bitmapscan',
    'enable_seqscan',
    'random_page_cost',
    'seq_page_cost',
    'effective_cache_size',
    'work_mem'
);

-- ==========================================
-- INTERPRETATION GUIDE
-- ==========================================
--
-- Look for these in the output:
--
-- 1. EXISTING INDEXES:
--    - Should see at least idx_flat_sales_date_type_only
--    - If missing, the CREATE INDEX commands will add them
--
-- 2. TABLE STATISTICS:
--    - last_analyze should be recent (within last hour)
--    - If NULL or old, ANALYZE command will update it
--
-- 3. QUERY PLANS:
--    - GOOD: "Index Scan" or "Bitmap Index Scan"
--    - BAD: "Seq Scan on flat_daily_sales_report"
--
-- 4. PLANNER SETTINGS:
--    - enable_indexscan should be 'on'
--    - enable_seqscan can be 'on' (planner chooses best)
--    - If enable_indexscan is 'off', contact DBA
--
-- ==========================================
-- FORCE INDEX USAGE (TEMPORARY TEST)
-- ==========================================
-- If indexes still not used, try forcing it:

-- Disable sequential scans temporarily
SET enable_seqscan = off;

-- Test query again
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2024-11-01'::date
  AND trx_trxdate <= '2024-11-30'::date
  AND trx_trxtype = 1;

-- Re-enable sequential scans
SET enable_seqscan = on;

-- ==========================================
-- FINAL CHECK: Index sizes
-- ==========================================
SELECT
    '=== INDEX SIZES ===' as info;

SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname = 'flat_daily_sales_report'
ORDER BY idx_scan DESC;

-- ==========================================
-- If index usage (idx_scan) is still 0 after running queries,
-- it means PostgreSQL thinks sequential scan is cheaper.
-- This usually happens when:
-- 1. Table is too small (< 10k rows)
-- 2. Query returns too many rows (> 10% of table)
-- 3. Statistics are wrong
-- ==========================================

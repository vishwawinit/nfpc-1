-- ============================================================================
-- ADVANCED LMTD Indexes - Maximum Performance
-- ============================================================================
-- These indexes use PostgreSQL's INCLUDE feature to create covering indexes
-- This eliminates the need to access the main table data
-- ============================================================================

BEGIN;

-- Drop old indexes if they exist (optional - only if recreating)
-- DROP INDEX IF EXISTS idx_flat_sales_date_type;
-- DROP INDEX IF EXISTS idx_flat_sales_trxdate_type;

-- ============================================================================
-- COVERING INDEX 1: MTD/LMTD Aggregation Index (MOST IMPORTANT)
-- ============================================================================
-- This index includes ALL columns needed for the MTD/LMTD queries
-- PostgreSQL can satisfy the entire query from the index without table access
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_lmtd_covering
ON flat_daily_sales_report(trx_trxdate, trx_trxtype)
INCLUDE (
    trx_usercode,
    customer_code,
    line_itemcode,
    route_salesmancode,
    customer_description,
    customer_channel_description,
    line_itemdescription,
    line_quantitybu,
    trx_totalamount
)
WHERE trx_trxtype = 1;

COMMENT ON INDEX idx_flat_sales_lmtd_covering IS
'Covering index for LMTD report - includes all necessary columns for index-only scans';

-- ============================================================================
-- COVERING INDEX 2: User-Filtered Queries
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_user_covering
ON flat_daily_sales_report(trx_trxdate, trx_usercode, trx_trxtype)
INCLUDE (
    customer_code,
    line_itemcode,
    route_salesmancode,
    customer_description,
    customer_channel_description,
    line_itemdescription,
    line_quantitybu,
    trx_totalamount
)
WHERE trx_trxtype = 1;

COMMENT ON INDEX idx_flat_sales_user_covering IS
'Covering index for user-filtered LMTD queries';

-- ============================================================================
-- COVERING INDEX 3: Store-Filtered Queries
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_customer_covering
ON flat_daily_sales_report(trx_trxdate, customer_code, trx_trxtype)
INCLUDE (
    trx_usercode,
    line_itemcode,
    route_salesmancode,
    customer_description,
    customer_channel_description,
    line_itemdescription,
    line_quantitybu,
    trx_totalamount
)
WHERE trx_trxtype = 1;

COMMENT ON INDEX idx_flat_sales_customer_covering IS
'Covering index for customer-filtered LMTD queries';

-- ============================================================================
-- BRIN INDEX: For Very Large Tables (100M+ rows)
-- ============================================================================
-- BRIN indexes are tiny but very fast for sequential data like dates
-- Use this if the table is extremely large
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_brin
ON flat_daily_sales_report USING BRIN (trx_trxdate)
WHERE trx_trxtype = 1;

COMMENT ON INDEX idx_flat_sales_date_brin IS
'BRIN index for very large tables - extremely small size, good for sequential scans';

COMMIT;

-- ============================================================================
-- Update Statistics
-- ============================================================================

ANALYZE flat_daily_sales_report;

-- ============================================================================
-- Verify Creation
-- ============================================================================

SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
    indexdef
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
    AND (indexname LIKE 'idx_flat_sales_lmtd%' OR indexname LIKE 'idx_flat_sales%covering')
ORDER BY indexname;

-- ============================================================================
-- Test Query Performance
-- ============================================================================

\echo 'Testing query performance with new indexes...'

EXPLAIN (ANALYZE, BUFFERS)
SELECT
    trx_usercode,
    customer_code,
    line_itemcode,
    SUM(ABS(COALESCE(line_quantitybu, 0))) as quantity,
    SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2025-11-01'::timestamp
  AND trx_trxdate < '2025-11-30'::timestamp
  AND trx_trxtype = 1
GROUP BY trx_usercode, customer_code, line_itemcode
LIMIT 1000;

\echo ''
\echo 'Look for "Index Only Scan" or "Index Scan" in the output above'
\echo 'If you see "Seq Scan", run: VACUUM ANALYZE flat_daily_sales_report;'

-- ============================================================================
-- Performance Tuning Settings (Optional)
-- ============================================================================
-- These settings can help PostgreSQL use indexes more aggressively
-- WARNING: Only change if you understand what they do
-- ============================================================================

-- Show current settings
SHOW work_mem;
SHOW effective_cache_size;
SHOW random_page_cost;

-- Example optimizations (adjust for your hardware):
-- SET work_mem = '256MB';  -- Allows larger in-memory sorts
-- SET effective_cache_size = '4GB';  -- Tell PG how much RAM is available for caching
-- SET random_page_cost = 1.1;  -- Lower value favors index scans (good for SSD)

\echo ''
\echo '========================================='
\echo 'Advanced indexes created successfully!'
\echo '========================================='
\echo ''
\echo 'Next steps:'
\echo '1. Run: VACUUM ANALYZE flat_daily_sales_report;'
\echo '2. Test the LMTD report'
\echo '3. Check server logs for query times'
\echo ''

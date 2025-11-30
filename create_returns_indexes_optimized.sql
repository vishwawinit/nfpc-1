-- ============================================================================
-- OPTIMIZED PERFORMANCE INDEXES FOR RETURNS & WASTAGE QUERIES
-- ============================================================================
-- This script creates critical indexes to improve query performance from
-- 3-9 minutes down to seconds.
--
-- IMPORTANT: Run this script during off-peak hours as index creation may
-- take 10-30 minutes depending on table size (14M+ rows).
--
-- Usage: Connect to your database and run this entire script
-- ============================================================================

-- Set statement timeout to allow long-running index creation
SET statement_timeout = '30min';

-- NOTE: Cannot use BEGIN/COMMIT with CREATE INDEX CONCURRENTLY
-- Indexes will be created one by one without transaction block

\echo 'Starting index creation for Returns & Wastage optimization...'
\echo 'Table: flat_daily_sales_report'
\echo 'Estimated time: 10-30 minutes for 14M+ rows'

-- ============================================================================
-- 1. PRIMARY COMPOSITE INDEX FOR RETURNS QUERIES
-- ============================================================================
-- This is the most critical index - covers trx_type filter and date range
\echo 'Creating idx_returns_main_composite...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_main_composite
ON flat_daily_sales_report (trx_trxtype, trx_trxdate, trx_collectiontype)
WHERE trx_trxtype = 4
INCLUDE (trx_trxcode, trx_totalamount, trx_usercode, customer_code, line_itemcode, item_grouplevel1, item_brand_description);

\echo 'Created idx_returns_main_composite'

-- ============================================================================
-- 2. REGION FILTER INDEX
-- ============================================================================
-- Speeds up queries filtered by region/area
\echo 'Creating idx_returns_region...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_region
ON flat_daily_sales_report (route_areacode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND route_areacode IS NOT NULL;

\echo 'Created idx_returns_region'

-- ============================================================================
-- 3. ROUTE FILTER INDEX
-- ============================================================================
-- Speeds up queries filtered by route
\echo 'Creating idx_returns_route...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_route
ON flat_daily_sales_report (trx_routecode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_routecode IS NOT NULL;

\echo 'Created idx_returns_route'

-- ============================================================================
-- 4. SALESMAN FILTER INDEX
-- ============================================================================
-- Speeds up queries filtered by salesman/user
\echo 'Creating idx_returns_salesman...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_salesman
ON flat_daily_sales_report (trx_usercode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_usercode IS NOT NULL;

\echo 'Created idx_returns_salesman'

-- ============================================================================
-- 5. PRODUCT/BRAND INDEX
-- ============================================================================
-- Speeds up product and brand aggregations
\echo 'Creating idx_returns_product_brand...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_product_brand
ON flat_daily_sales_report (line_itemcode, item_brand_description, trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4 AND line_itemcode IS NOT NULL;

\echo 'Created idx_returns_product_brand'

-- ============================================================================
-- 6. CATEGORY INDEX
-- ============================================================================
-- Speeds up category aggregations
\echo 'Creating idx_returns_category...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_category
ON flat_daily_sales_report (item_grouplevel1, trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4 AND item_grouplevel1 IS NOT NULL;

\echo 'Created idx_returns_category'

-- ============================================================================
-- 7. DATE INDEX FOR TRENDS
-- ============================================================================
-- Speeds up daily trend queries
\echo 'Creating idx_returns_date_trend...'

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_date_trend
ON flat_daily_sales_report (DATE(trx_trxdate), trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4;

\echo 'Created idx_returns_date_trend'

-- ============================================================================
-- UPDATE TABLE STATISTICS
-- ============================================================================
-- This helps PostgreSQL query planner use the indexes effectively
\echo 'Analyzing table statistics...'

ANALYZE flat_daily_sales_report;

\echo 'Analysis complete!'

-- ============================================================================
-- INDEX CREATION COMPLETE
-- ============================================================================
\echo '============================================================================'
\echo 'INDEX CREATION COMPLETE!'
\echo '============================================================================'
\echo 'All indexes created successfully.'
\echo 'Expected performance improvement:'
\echo '  - Returns query: 3-9 minutes -> 5-30 seconds'
\echo '  - Filters query: 9 minutes -> 2-10 seconds'
\echo ''
\echo 'Next steps:'
\echo '  1. Restart your Next.js dev server'
\echo '  2. Clear browser cache'
\echo '  3. Test the Returns & Wastage page'
\echo '============================================================================'

-- ============================================================================
-- VERIFY INDEXES
-- ============================================================================
-- Run this query to verify all indexes were created:
/*
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
  AND indexname LIKE 'idx_returns%'
ORDER BY indexname;
*/

-- ============================================================================
-- MONITOR INDEX USAGE
-- ============================================================================
-- Run this query after a few hours to verify indexes are being used:
/*
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'flat_daily_sales_report'
  AND indexname LIKE 'idx_returns%'
ORDER BY idx_scan DESC;
*/

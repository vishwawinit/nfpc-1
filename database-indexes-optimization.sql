-- ========================================
-- DATABASE INDEX OPTIMIZATION FOR STORE USER VISIT REPORT
-- ========================================
-- This file contains indexes to optimize the Store User Visit Report query performance
-- Execute these statements on your PostgreSQL database to improve load times

-- Problem: The LEFT JOIN subquery aggregates the entire flat_daily_sales_report table
-- without efficient indexes, causing slow performance (7+ seconds for 21K records)

-- Solution: Add composite indexes to speed up:
-- 1. The WHERE clause filtering in the subquery
-- 2. The GROUP BY aggregation
-- 3. The JOIN conditions between tables

-- ========================================
-- INDEX 1: Optimize flat_daily_sales_report subquery
-- ========================================
-- This index covers the WHERE clause and JOIN columns in the sales subquery
-- Speeds up: WHERE trx_trxtype = 1 + GROUP BY + JOIN conditions

CREATE INDEX IF NOT EXISTS idx_flat_daily_sales_trx_join
ON flat_daily_sales_report(trx_trxtype, trx_usercode, customer_code, trx_trxdate)
WHERE trx_trxtype = 1;

-- Partial index that only includes sales transactions (trx_trxtype = 1)
-- This dramatically reduces index size and improves query speed

-- ========================================
-- INDEX 2: Optimize flat_customer_visit main query
-- ========================================
-- This index covers the WHERE clause date filtering and JOIN columns

CREATE INDEX IF NOT EXISTS idx_flat_customer_visit_date_user_store
ON flat_customer_visit(visit_date, user_code, customer_code);

-- Speeds up: WHERE DATE(visit_date) BETWEEN x AND y + JOIN conditions

-- ========================================
-- INDEX 3: Additional index for arrival_time sorting
-- ========================================
-- This index optimizes the ORDER BY clause

CREATE INDEX IF NOT EXISTS idx_flat_customer_visit_date_arrival
ON flat_customer_visit(visit_date DESC, arrival_time DESC);

-- Speeds up: ORDER BY v.visit_date DESC, v.arrival_time DESC

-- ========================================
-- ANALYZE TABLES (Run after creating indexes)
-- ========================================
-- Update table statistics so PostgreSQL query planner can use the new indexes effectively

ANALYZE flat_daily_sales_report;
ANALYZE flat_customer_visit;

-- ========================================
-- VERIFY INDEX CREATION
-- ========================================
-- Run this query to verify indexes were created:

SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('flat_daily_sales_report', 'flat_customer_visit')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ========================================
-- EXPECTED PERFORMANCE IMPROVEMENT
-- ========================================
-- Before indexes: 7+ seconds for 21K records
-- After indexes: Expected < 1 second for 21K records
-- Improvement: 7-10x faster query execution

-- ========================================
-- MAINTENANCE NOTES
-- ========================================
-- 1. These indexes will be automatically maintained by PostgreSQL
-- 2. They will slightly slow down INSERT/UPDATE operations (~5-10%)
-- 3. Index size: approximately 50-100MB per index
-- 4. Re-run ANALYZE monthly for optimal performance

-- ========================================
-- ROLLBACK (if needed)
-- ========================================
-- To remove these indexes:
-- DROP INDEX IF EXISTS idx_flat_daily_sales_trx_join;
-- DROP INDEX IF EXISTS idx_flat_customer_visit_date_user_store;
-- DROP INDEX IF EXISTS idx_flat_customer_visit_date_arrival;

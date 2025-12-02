-- Verify that the indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('flat_daily_sales_report', 'flat_customer_visit')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('flat_daily_sales_report', 'flat_customer_visit')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check if indexes are being used
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('flat_daily_sales_report', 'flat_customer_visit')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

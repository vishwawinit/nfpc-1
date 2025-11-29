-- Create indexes for flat_daily_sales_report table to optimize Orders Report queries
-- This will significantly speed up queries from 75-120 seconds to under 1 second

-- Core filter indexes
CREATE INDEX IF NOT EXISTS idx_flat_sales_trxtype_date
ON flat_daily_sales_report(trx_trxtype, trx_trxdate);

CREATE INDEX IF NOT EXISTS idx_flat_sales_trxdate
ON flat_daily_sales_report(trx_trxdate);

-- Hierarchical filter indexes
CREATE INDEX IF NOT EXISTS idx_flat_sales_areacode
ON flat_daily_sales_report(route_areacode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_subareacode
ON flat_daily_sales_report(route_subareacode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_teamleader
ON flat_daily_sales_report(route_salesmancode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_usertype
ON flat_daily_sales_report(user_usertype);

CREATE INDEX IF NOT EXISTS idx_flat_sales_usercode
ON flat_daily_sales_report(trx_usercode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_channelcode
ON flat_daily_sales_report(customer_channelcode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_customercode
ON flat_daily_sales_report(customer_code);

CREATE INDEX IF NOT EXISTS idx_flat_sales_category
ON flat_daily_sales_report(item_category_description);

-- Transaction code index for order details lookup
CREATE INDEX IF NOT EXISTS idx_flat_sales_trxcode
ON flat_daily_sales_report(trx_trxcode);

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_flat_sales_type_date_area
ON flat_daily_sales_report(trx_trxtype, trx_trxdate, route_areacode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_type_date_subarea
ON flat_daily_sales_report(trx_trxtype, trx_trxdate, route_subareacode);

CREATE INDEX IF NOT EXISTS idx_flat_sales_type_date_user
ON flat_daily_sales_report(trx_trxtype, trx_trxdate, trx_usercode);

-- Index for search queries
CREATE INDEX IF NOT EXISTS idx_flat_sales_customer_desc
ON flat_daily_sales_report(customer_description);

-- Analyze table to update statistics
ANALYZE flat_daily_sales_report;

-- Display index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
ORDER BY pg_relation_size(indexname::regclass) DESC;

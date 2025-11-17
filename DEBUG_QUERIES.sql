-- 🔍 DEBUG QUERIES TO VERIFY DATA AVAILABILITY AND PERFORMANCE

-- 1. Basic connectivity and table existence check
SELECT COUNT(*) as flat_transactions_count FROM flat_transactions;
SELECT COUNT(*) as flat_customers_master_count FROM flat_customers_master;

-- 2. Sample data check from flat_transactions
SELECT 
    transaction_code,
    customer_code,
    product_code,
    net_amount,
    quantity_bu,
    transaction_date,
    currency_code
FROM flat_transactions 
WHERE net_amount > 0
ORDER BY transaction_date DESC 
LIMIT 10;

-- 3. Check if there are any sales in the recent past
SELECT 
    COUNT(*) as total_transactions,
    SUM(CASE WHEN net_amount > 0 THEN 1 ELSE 0 END) as positive_transactions,
    SUM(CASE WHEN net_amount < 0 THEN 1 ELSE 0 END) as negative_transactions,
    MIN(transaction_date) as earliest_date,
    MAX(transaction_date) as latest_date
FROM flat_transactions;

-- 4. Test KPI query for today
SELECT
    COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0) as total_sales,
    COALESCE(SUM(CASE WHEN t.net_amount < 0 THEN ABS(t.net_amount) ELSE 0 END), 0) as return_sales,
    COUNT(DISTINCT CASE WHEN t.net_amount >= 0 THEN t.transaction_code END) as total_orders,
    COUNT(DISTINCT t.customer_code) as unique_customers,
    COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.quantity_bu ELSE 0 END), 0) as total_quantity,
    COUNT(*) as total_records
FROM flat_transactions t
LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '7 days';

-- 5. Test top customers query
SELECT
    t.customer_code as "customerCode",
    COALESCE(c.customer_name, 'Unknown Customer') as "customerName",
    ROUND(COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0), 2) as "totalSales",
    COUNT(DISTINCT CASE WHEN t.net_amount >= 0 THEN t.transaction_code END) as "totalOrders"
FROM flat_transactions t
LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
  AND t.net_amount > 0
GROUP BY t.customer_code, c.customer_name
HAVING SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END) > 0
ORDER BY "totalSales" DESC
LIMIT 10;

-- 6. Test top products query  
SELECT
    t.product_code as "productCode",
    MAX(t.product_name) as "productName",
    ROUND(COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0), 2) as "salesAmount",
    ROUND(COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.quantity_bu ELSE 0 END), 0), 0) as "quantitySold"
FROM flat_transactions t
LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
  AND t.net_amount > 0
GROUP BY t.product_code
HAVING SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END) > 0
ORDER BY "salesAmount" DESC
LIMIT 10;

-- 7. Test sales trend query
SELECT
    DATE(t.transaction_date) as date,
    ROUND(COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0), 2) as sales,
    COUNT(DISTINCT CASE WHEN t.net_amount >= 0 THEN t.transaction_code END) as orders,
    COUNT(DISTINCT CASE WHEN t.net_amount >= 0 THEN t.customer_code END) as customers
FROM flat_transactions t
LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '7 days'
  AND t.net_amount > 0
GROUP BY DATE(t.transaction_date)
ORDER BY DATE(t.transaction_date) ASC;

-- 8. Check filter data availability
SELECT DISTINCT c.state FROM flat_customers_master c WHERE c.state IS NOT NULL LIMIT 5;
SELECT DISTINCT c.city FROM flat_customers_master c WHERE c.city IS NOT NULL LIMIT 5;
SELECT DISTINCT c.customer_type FROM flat_customers_master c WHERE c.customer_type IS NOT NULL LIMIT 5;

-- 9. Performance test - check query execution time
EXPLAIN ANALYZE 
SELECT
    COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0) as total_sales,
    COUNT(DISTINCT t.customer_code) as unique_customers
FROM flat_transactions t
LEFT JOIN flat_customers_master c ON t.customer_code = c.customer_code
WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days';

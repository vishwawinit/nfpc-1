-- First, find a customer with recent sales transactions
SELECT
  customer_code,
  MAX(customer_description) as customer_name,
  COUNT(DISTINCT trx_trxcode) as order_count,
  SUM(trx_totalamount) as total_sales,
  MAX(trx_trxdate::date) as last_order_date
FROM flat_daily_sales_report
WHERE trx_trxtype = '1'
  AND trx_trxdate::date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY customer_code
HAVING COUNT(DISTINCT trx_trxcode) > 5
ORDER BY SUM(trx_totalamount) DESC
LIMIT 5;

-- Then test the daily transactions query for the top customer
-- Replace {CUSTOMER_CODE} with the actual customer code from above
SELECT
  trx_trxdate::date as transaction_date,
  COUNT(DISTINCT trx_trxcode) as order_count,
  SUM(trx_totalamount) as total_amount,
  SUM(line_quantitybu) as total_quantity
FROM flat_daily_sales_report
WHERE customer_code = '101001' -- Replace with actual customer code
  AND trx_trxtype = '1'
  AND trx_trxdate::date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY trx_trxdate::date
ORDER BY trx_trxdate::date DESC
LIMIT 10;

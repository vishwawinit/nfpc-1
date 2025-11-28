-- Check available columns in flat_daily_sales_report for transaction details
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'flat_daily_sales_report'
  AND column_name LIKE ANY(ARRAY['%trx%', '%product%', '%line%'])
ORDER BY ordinal_position;

-- Sample query to see transaction line items for a customer
SELECT
  trx_trxcode as transaction_id,
  trx_trxdate as date,
  line_itemcode as product_code,
  line_item_description as product_name,
  line_quantitybu as quantity,
  line_unitprice as unit_price,
  trx_totalamount as total,
  line_netamount as net_amount,
  trx_trxtype as transaction_type
FROM flat_daily_sales_report
WHERE customer_code = '177736'
  AND trx_trxtype = '1'
  AND trx_trxdate::date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY trx_trxdate DESC
LIMIT 10;

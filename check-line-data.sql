-- Check what data exists for a specific transaction
SELECT
  trx_trxcode,
  trx_totalamount,
  line_itemcode,
  line_itemdescription,
  line_quantitybu,
  line_baseprice,
  (line_baseprice * line_quantitybu) as calculated_line_total,
  line_totaldiscountamount
FROM flat_daily_sales_report
WHERE customer_code = '179259'
  AND trx_trxtype = '1'
  AND trx_trxcode = '00020_261000235'
ORDER BY line_itemcode;

-- This will show us if trx_totalamount is the same for all lines in the transaction
-- and help us understand the data structure

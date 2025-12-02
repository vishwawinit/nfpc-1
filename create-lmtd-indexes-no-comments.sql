ANALYZE flat_daily_sales_report;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_type_only
ON flat_daily_sales_report(trx_trxdate, trx_trxtype)
WHERE trx_trxtype = 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_user_type
ON flat_daily_sales_report(trx_trxdate, trx_usercode, trx_trxtype)
WHERE trx_trxtype = 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_customer_type
ON flat_daily_sales_report(trx_trxdate, customer_code, trx_trxtype)
WHERE trx_trxtype = 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_product_type
ON flat_daily_sales_report(trx_trxdate, line_itemcode, trx_trxtype)
WHERE trx_trxtype = 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_date_teamleader_type
ON flat_daily_sales_report(trx_trxdate, route_salesmancode, trx_trxtype)
WHERE trx_trxtype = 1 AND route_salesmancode IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flat_sales_user_cust_prod_combo
ON flat_daily_sales_report(trx_usercode, customer_code, line_itemcode, trx_trxdate)
WHERE trx_trxtype = 1;

ANALYZE flat_daily_sales_report;

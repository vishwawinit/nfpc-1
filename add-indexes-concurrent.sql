CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_date_type ON flat_daily_sales_report(trx_trxdate, trx_trxtype) WHERE trx_trxtype = 1;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_user_customer_product ON flat_daily_sales_report(trx_usercode, customer_code, line_itemcode) WHERE trx_trxtype = 1;

ANALYZE flat_daily_sales_report;

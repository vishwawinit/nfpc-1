CREATE INDEX IF NOT EXISTS idx_sales_date_type ON flat_daily_sales_report(trx_trxdate, trx_trxtype) WHERE trx_trxtype = 1;

CREATE INDEX IF NOT EXISTS idx_sales_date_type_revenue ON flat_daily_sales_report(trx_trxdate, trx_trxtype, trx_totalamount) WHERE trx_trxtype = 1 AND trx_totalamount > 0;

CREATE INDEX IF NOT EXISTS idx_sales_user_customer_product ON flat_daily_sales_report(trx_usercode, customer_code, line_itemcode) WHERE trx_trxtype = 1;

CREATE INDEX IF NOT EXISTS idx_sales_teamleader ON flat_daily_sales_report(route_salesmancode) WHERE trx_trxtype = 1 AND route_salesmancode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customer ON flat_daily_sales_report(customer_code) WHERE trx_trxtype = 1 AND customer_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_product ON flat_daily_sales_report(line_itemcode) WHERE trx_trxtype = 1 AND line_itemcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_channel ON flat_daily_sales_report(customer_channel_description) WHERE trx_trxtype = 1 AND customer_channel_description IS NOT NULL;

ANALYZE flat_daily_sales_report;

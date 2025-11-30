SET statement_timeout = '30min';

CREATE INDEX IF NOT EXISTS idx_returns_main
ON flat_daily_sales_report (trx_trxtype, trx_trxdate, trx_collectiontype, trx_trxcode)
WHERE trx_trxtype = 4;

CREATE INDEX IF NOT EXISTS idx_returns_region
ON flat_daily_sales_report (trx_trxtype, route_areacode, trx_trxdate)
WHERE trx_trxtype = 4 AND route_areacode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_route
ON flat_daily_sales_report (trx_trxtype, trx_routecode, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_routecode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_salesman
ON flat_daily_sales_report (trx_trxtype, trx_usercode, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_usercode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_customer
ON flat_daily_sales_report (trx_trxtype, customer_code, trx_collectiontype)
WHERE trx_trxtype = 4 AND customer_code IS NOT NULL;

ANALYZE flat_daily_sales_report;

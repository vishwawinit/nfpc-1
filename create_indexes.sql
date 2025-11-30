SET statement_timeout = '30min';

BEGIN;

CREATE INDEX IF NOT EXISTS idx_returns_main_composite
ON flat_daily_sales_report (trx_trxtype, trx_trxdate, trx_collectiontype)
WHERE trx_trxtype = 4;

CREATE INDEX IF NOT EXISTS idx_returns_region
ON flat_daily_sales_report (route_areacode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND route_areacode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_route
ON flat_daily_sales_report (trx_routecode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_routecode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_salesman
ON flat_daily_sales_report (trx_usercode, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND trx_usercode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_product_brand
ON flat_daily_sales_report (line_itemcode, item_brand_description, trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4 AND line_itemcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_category
ON flat_daily_sales_report (item_grouplevel1, trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4 AND item_grouplevel1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_date_trend
ON flat_daily_sales_report (DATE(trx_trxdate), trx_trxtype, trx_collectiontype)
WHERE trx_trxtype = 4;

CREATE INDEX IF NOT EXISTS idx_returns_transaction_code
ON flat_daily_sales_report (trx_trxcode, trx_trxtype)
WHERE trx_trxtype = 4;

CREATE INDEX IF NOT EXISTS idx_returns_customer
ON flat_daily_sales_report (customer_code, trx_trxtype, trx_trxdate)
WHERE trx_trxtype = 4 AND customer_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_brand
ON flat_daily_sales_report (item_brand_description, trx_trxtype)
WHERE trx_trxtype = 4 AND item_brand_description IS NOT NULL;

ANALYZE flat_daily_sales_report;

COMMIT;

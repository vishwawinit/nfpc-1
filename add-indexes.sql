-- Critical performance indexes for flat_daily_sales_report table
-- Run this SQL script in your PostgreSQL database

-- Main composite index for transaction type and date (most used filters)
CREATE INDEX IF NOT EXISTS idx_flat_sales_trxtype_date
ON flat_daily_sales_report(trx_trxtype, trx_trxdate);

-- Individual indexes for geographic filters
CREATE INDEX IF NOT EXISTS idx_flat_sales_areacode
ON flat_daily_sales_report(route_areacode)
WHERE route_areacode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flat_sales_subareacode
ON flat_daily_sales_report(route_subareacode)
WHERE route_subareacode IS NOT NULL;

-- Index for customer filtering
CREATE INDEX IF NOT EXISTS idx_flat_sales_customer
ON flat_daily_sales_report(customer_code)
WHERE customer_code IS NOT NULL;

-- Index for user/salesman filtering
CREATE INDEX IF NOT EXISTS idx_flat_sales_usercode
ON flat_daily_sales_report(trx_usercode)
WHERE trx_usercode IS NOT NULL;

-- Index for team leader filtering
CREATE INDEX IF NOT EXISTS idx_flat_sales_teamleader
ON flat_daily_sales_report(route_salesmancode)
WHERE route_salesmancode IS NOT NULL;

-- Index for transaction code (for DISTINCT counts)
CREATE INDEX IF NOT EXISTS idx_flat_sales_trxcode
ON flat_daily_sales_report(trx_trxcode)
WHERE trx_trxcode IS NOT NULL;

-- Index for channel/chain filtering
CREATE INDEX IF NOT EXISTS idx_flat_sales_channel
ON flat_daily_sales_report(customer_channel_description)
WHERE customer_channel_description IS NOT NULL;

-- Index for product category filtering (for LMTD report)
CREATE INDEX IF NOT EXISTS idx_flat_sales_category
ON flat_daily_sales_report(item_grouplevel1)
WHERE item_grouplevel1 IS NOT NULL;

-- Index for product/item code filtering (for LMTD report)
CREATE INDEX IF NOT EXISTS idx_flat_sales_itemcode
ON flat_daily_sales_report(line_itemcode)
WHERE line_itemcode IS NOT NULL;

-- Composite index for common filter combinations (date + type + area)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_area
ON flat_daily_sales_report(trx_trxdate, trx_trxtype, route_areacode);

-- Composite index for LMTD filters (date + type + team leader)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_tl
ON flat_daily_sales_report(DATE(trx_trxdate), trx_trxtype, route_salesmancode)
WHERE trx_trxtype = 1 AND route_salesmancode IS NOT NULL;

-- Composite index for LMTD filters (date + type + user)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_user
ON flat_daily_sales_report(DATE(trx_trxdate), trx_trxtype, trx_usercode)
WHERE trx_trxtype = 1 AND trx_usercode IS NOT NULL;

-- Composite index for LMTD filters (date + type + chain)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_chain
ON flat_daily_sales_report(DATE(trx_trxdate), trx_trxtype, customer_channel_description)
WHERE trx_trxtype = 1 AND customer_channel_description IS NOT NULL;

-- Composite index for LMTD filters (date + type + customer)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_customer
ON flat_daily_sales_report(DATE(trx_trxdate), trx_trxtype, customer_code)
WHERE trx_trxtype = 1 AND customer_code IS NOT NULL;

-- Composite index for LMTD filters (date + type + category)
CREATE INDEX IF NOT EXISTS idx_flat_sales_date_type_category
ON flat_daily_sales_report(DATE(trx_trxdate), trx_trxtype, item_grouplevel1)
WHERE trx_trxtype = 1 AND item_grouplevel1 IS NOT NULL;

-- Index for amount aggregations
CREATE INDEX IF NOT EXISTS idx_flat_sales_amount
ON flat_daily_sales_report(trx_totalamount)
WHERE trx_totalamount IS NOT NULL;

-- Show index creation progress
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
ORDER BY indexname;

-- Analyze the table to update statistics
ANALYZE flat_daily_sales_report;

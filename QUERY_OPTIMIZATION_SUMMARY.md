# Query Optimization Summary

## Overview
All queries have been optimized to fetch default filter data in milliseconds by:
1. **Eliminating unnecessary JOINs** when no filters require customer master data
2. **Optimizing WHERE clause order** to use indexes effectively
3. **Conditional JOIN logic** that only adds JOINs when filters require them
4. **Streamlined query structure** for default filter scenarios

## Key Optimizations

### 1. Default Filter Detection
All query functions now detect when only date range filters are applied (default filters):
- No region, city, team leader, chain, store, product, or category filters
- Skips unnecessary JOINs with `flat_customers_master` table
- Reduces query complexity and execution time

### 2. Conditional JOINs
- **Before**: Always joined with `flat_customers_master` even when not needed
- **After**: Only joins when filters require customer master data (region, city, TL, chain)

### 3. Optimized WHERE Clause Order
- Date filters placed first for optimal index usage
- `net_amount IS NOT NULL` filter early to reduce dataset
- Other filters applied in order of selectivity

### 4. Query-Specific Optimizations

#### Daily Sales Summary (`getDailySalesSummary`)
- Removed JOIN for default filters
- Optimized aggregations (COUNT DISTINCT, SUM, AVG)
- Date filter first for index scan

#### Daily Trend (`getDailyTrend`)
- Conditional JOIN based on filter requirements
- Optimized GROUP BY with date expression
- Date filter first for index usage

#### Product Performance (`getProductPerformance`)
- No JOIN needed for default filters
- Direct product code grouping
- Optimized aggregations

#### Store Performance (`getStorePerformance`)
- Conditional JOIN only when region filter applied
- Optimized store grouping
- Reduced column lookups for default filters

#### User Performance (`getUserPerformance`)
- No JOIN needed for default filters
- Direct user code grouping
- Streamlined aggregations

#### Transaction Details (`getTransactionDetails`)
- Conditional JOIN based on filter requirements
- Optimized pagination with parallel count/data queries
- Date filter first for index usage

## Database Index Recommendations

For optimal performance, ensure these indexes exist on `flat_transactions`:

```sql
-- Primary index for date range queries (CRITICAL)
CREATE INDEX IF NOT EXISTS idx_transactions_date_net_amount 
ON flat_transactions (DATE(transaction_date), net_amount) 
WHERE net_amount IS NOT NULL;

-- Index for customer code lookups
CREATE INDEX IF NOT EXISTS idx_transactions_customer_code 
ON flat_transactions (customer_code) 
WHERE net_amount IS NOT NULL;

-- Index for user code filtering
CREATE INDEX IF NOT EXISTS idx_transactions_user_code 
ON flat_transactions (user_code) 
WHERE net_amount IS NOT NULL;

-- Index for product code filtering
CREATE INDEX IF NOT EXISTS idx_transactions_product_code 
ON flat_transactions (product_code) 
WHERE net_amount IS NOT NULL;

-- Composite index for date + customer + product (for detailed queries)
CREATE INDEX IF NOT EXISTS idx_transactions_date_customer_product 
ON flat_transactions (DATE(transaction_date), customer_code, product_code) 
WHERE net_amount IS NOT NULL;

-- Index on customer master for JOINs
CREATE INDEX IF NOT EXISTS idx_customers_code 
ON flat_customers_master (customer_code);

-- Index on customer master for region/city filters
CREATE INDEX IF NOT EXISTS idx_customers_state_city 
ON flat_customers_master (state, city);
```

## Performance Improvements

### Expected Results:
- **Default filters (date range only)**: < 100ms
- **With single filter**: < 200ms
- **With multiple filters**: < 500ms

### Factors Affecting Performance:
1. **Database size**: Larger tables may require longer query times
2. **Index presence**: Missing indexes will significantly slow queries
3. **Date range size**: Shorter date ranges = faster queries
4. **Network latency**: Database connection speed affects total time

## Monitoring

To monitor query performance:
1. Check database query logs for slow queries (> 1 second)
2. Use `EXPLAIN ANALYZE` on queries to identify bottlenecks
3. Monitor cache hit rates in application logs
4. Track API response times in browser DevTools

## Next Steps

1. **Create recommended indexes** on the database
2. **Monitor query performance** after deployment
3. **Adjust cache durations** if needed based on data freshness requirements
4. **Consider materialized views** for frequently accessed aggregations if needed


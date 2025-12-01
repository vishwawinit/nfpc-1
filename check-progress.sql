SELECT
    phase,
    ROUND(100.0 * tuples_done / NULLIF(tuples_total, 0), 2) AS pct_done,
    tuples_done,
    tuples_total,
    ROUND(100.0 * blocks_done / NULLIF(blocks_total, 0), 2) AS blocks_pct,
    blocks_done,
    blocks_total
FROM pg_stat_progress_create_index;

SELECT indexname FROM pg_indexes WHERE tablename = 'flat_daily_sales_report' AND indexname LIKE 'idx_sales%';

SELECT
    pid,
    datname,
    query,
    state,
    now() - query_start AS duration
FROM pg_stat_activity
WHERE query LIKE '%CREATE INDEX%'
    AND state != 'idle'
ORDER BY query_start;

SELECT
    a.query,
    p.phase,
    p.blocks_total,
    p.blocks_done,
    p.tuples_total,
    p.tuples_done,
    ROUND(100.0 * p.tuples_done / NULLIF(p.tuples_total, 0), 2) AS pct_done
FROM pg_stat_progress_create_index p
JOIN pg_stat_activity a ON a.pid = p.pid;

SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid IN (125397, 125407, 127251, 127275, 128146, 128151, 128417, 128431, 128690, 128708, 129931, 129934)
AND state = 'active'
AND query LIKE '%line_itemcode%';

SELECT
    pid,
    state,
    LEFT(query, 80) AS query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start;

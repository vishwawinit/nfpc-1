-- ========================================
-- CHECK RUNNING QUERIES ON PostgreSQL DATABASE
-- ========================================

-- 1. View ALL currently running queries
SELECT
    pid,
    usename as username,
    application_name,
    client_addr as client_ip,
    state,
    query_start,
    state_change,
    EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
    LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()  -- Exclude this query itself
ORDER BY query_start;

-- 2. View LONG-RUNNING queries (running for more than 5 seconds)
SELECT
    pid,
    usename,
    application_name,
    EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
  AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 5
ORDER BY query_start;

-- 3. View queries from your Node.js application
SELECT
    pid,
    EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
    state,
    LEFT(query, 150) as query_preview
FROM pg_stat_activity
WHERE application_name LIKE '%node%'
   OR client_addr IS NOT NULL
ORDER BY query_start;

-- ========================================
-- KILL QUERIES (Use these carefully!)
-- ========================================

-- 4. Kill a SPECIFIC query by PID (replace 12345 with actual PID from above)
-- SELECT pg_terminate_backend(12345);

-- 5. Kill ALL long-running queries (over 30 seconds)
-- WARNING: This will kill queries that are legitimately running!
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE state != 'idle'
--   AND pid != pg_backend_pid()
--   AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 30;

-- 6. Kill ALL queries from your application (Node.js)
-- WARNING: This will disconnect all app connections!
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE (application_name LIKE '%node%' OR client_addr IS NOT NULL)
--   AND pid != pg_backend_pid();

-- 7. Kill IDLE connections that have been idle for more than 10 minutes
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE state = 'idle'
--   AND EXTRACT(EPOCH FROM (NOW() - state_change)) > 600
--   AND pid != pg_backend_pid();

-- ========================================
-- STATS: Connection and Query Summary
-- ========================================

-- 8. Count connections by state
SELECT
    state,
    COUNT(*) as count,
    MAX(EXTRACT(EPOCH FROM (NOW() - query_start))) as max_duration_seconds
FROM pg_stat_activity
WHERE pid != pg_backend_pid()
GROUP BY state
ORDER BY count DESC;

-- 9. Count connections by application
SELECT
    application_name,
    COUNT(*) as connection_count,
    COUNT(CASE WHEN state = 'active' THEN 1 END) as active_queries
FROM pg_stat_activity
WHERE pid != pg_backend_pid()
GROUP BY application_name
ORDER BY connection_count DESC;

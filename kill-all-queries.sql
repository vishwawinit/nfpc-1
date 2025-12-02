-- ========================================
-- KILL ALL RUNNING QUERIES - USE WITH CAUTION!
-- ========================================
-- This will terminate all active connections from your application
-- Run this if your database is stuck or has too many connections

-- Step 1: See what will be killed
SELECT
    pid,
    usename,
    application_name,
    EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
    state,
    LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY query_start;

-- Step 2: Kill all active queries (UNCOMMENT TO EXECUTE)
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE state = 'active'
--   AND pid != pg_backend_pid();

-- Step 3: Kill ALL connections from your app (UNCOMMENT TO EXECUTE)
-- This is more aggressive - use if Step 2 doesn't work
-- SELECT pg_terminate_backend(pid)
-- FROM pg_stat_activity
-- WHERE pid != pg_backend_pid();

-- ========================================
-- After killing queries, check connection count:
-- ========================================
SELECT COUNT(*) as remaining_connections
FROM pg_stat_activity
WHERE pid != pg_backend_pid();

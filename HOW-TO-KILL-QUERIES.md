# How to Check and Kill Running Database Queries

## 🔍 Step 1: Check What Queries Are Running

Run this command to see all active queries:

```bash
psql -U postgres -d fmcg_db -f check-running-queries.sql
```

**OR** if you have a password:

```bash
psql -U postgres -d fmcg_db -W -f check-running-queries.sql
```

This will show you:
- All running queries
- How long each query has been running
- Query details (PID, user, duration)

---

## ⚠️ Step 2: Kill Specific Long-Running Queries

### Option A: Kill ONE specific query

1. Find the **PID** from Step 1 output
2. Run:

```bash
psql -U postgres -d fmcg_db -c "SELECT pg_terminate_backend(12345);"
```

Replace `12345` with the actual PID.

---

### Option B: Kill ALL long-running queries (over 30 seconds)

```bash
psql -U postgres -d fmcg_db -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
  AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 30;
"
```

---

### Option C: Kill ALL queries from your application

⚠️ **WARNING**: This will disconnect ALL app connections!

```bash
psql -U postgres -d fmcg_db -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid != pg_backend_pid();
"
```

---

## 🚀 Quick Kill Script (NUCLEAR OPTION)

If your database is completely stuck, run:

```bash
psql -U postgres -d fmcg_db -f kill-all-queries.sql
```

Then **uncomment the lines** in `kill-all-queries.sql` and run again.

---

## 🔄 Step 3: Restart Your Application

After killing queries, restart your Node.js app:

```bash
# Kill the dev server
# Then restart:
npm run dev
```

---

## 📊 Check Connection Stats

To see how many connections are active:

```bash
psql -U postgres -d fmcg_db -c "
SELECT
    state,
    COUNT(*) as count
FROM pg_stat_activity
GROUP BY state;
"
```

---

## 🎯 If You're Using pgAdmin (GUI)

1. Open **pgAdmin**
2. Connect to your database
3. Go to **Dashboard** → **Server Activity**
4. Right-click on any query → **Terminate Backend**

---

## ⚡ Performance Tip

Your queries are slow because you're loading **21,179 records at once**.

**Solution**: Implement pagination to load 1,000 records at a time instead.

Would you like me to implement pagination now?

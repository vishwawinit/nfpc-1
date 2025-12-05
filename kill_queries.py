import psycopg2
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Database connection parameters
db_config = {
    'host': os.getenv('DB_HOST'),
    'port': os.getenv('DB_PORT'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

try:
    # Connect to the database
    conn = psycopg2.connect(**db_config)
    conn.autocommit = True
    cursor = conn.cursor()

    # Get all active queries (excluding this connection)
    cursor.execute("""
        SELECT pid, usename, application_name, client_addr, state, query_start, query
        FROM pg_stat_activity
        WHERE state = 'active'
        AND pid != pg_backend_pid()
        AND datname = %s;
    """, (db_config['database'],))

    active_queries = cursor.fetchall()

    if not active_queries:
        print("No active queries found to kill.")
    else:
        print(f"Found {len(active_queries)} active queries:")
        print("-" * 100)

        for query in active_queries:
            pid, usename, app_name, client_addr, state, query_start, sql = query
            print(f"\nPID: {pid}")
            print(f"User: {usename}")
            print(f"Application: {app_name}")
            print(f"Client: {client_addr}")
            print(f"State: {state}")
            print(f"Started: {query_start}")
            print(f"Query: {sql[:100]}..." if len(sql) > 100 else f"Query: {sql}")
            print("-" * 100)

        # Kill all active queries
        print("\nTerminating all active queries...")
        for query in active_queries:
            pid = query[0]
            try:
                cursor.execute("SELECT pg_terminate_backend(%s);", (pid,))
                print(f"✓ Successfully terminated PID: {pid}")
            except Exception as e:
                print(f"✗ Failed to terminate PID {pid}: {e}")

    cursor.close()
    conn.close()
    print("\nDone!")

except Exception as e:
    print(f"Error: {e}")

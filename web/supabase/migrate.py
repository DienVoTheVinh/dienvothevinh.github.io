import sys
import os

try:
    import pg8000
except ImportError:
    print("pg8000 is not installed. Please install it using: .venv/bin/pip install pg8000")
    sys.exit(1)

def run_migration():
    if len(sys.argv) < 2:
        print("Usage: python migrate.py <POSTGRES_CONNECTION_URI>")
        sys.exit(1)
    
    connection_uri = sys.argv[1]
    sql_file_name = sys.argv[2] if len(sys.argv) > 2 else "update_theory_progress_schema.sql"
    
    # Read the SQL migration file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sql_file_path = os.path.join(script_dir, sql_file_name)
    
    if not os.path.exists(sql_file_path):
        print(f"SQL file not found at: {sql_file_path}")
        sys.exit(1)
        
    with open(sql_file_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    print("Connecting to Supabase PostgreSQL database...")
    try:
        # Parsed URI connection using pg8000
        # pg8000.connect accepts connection parameters. We can parse the URI or use pg8000.dbapi.connect
        # Actually, pg8000 has native URI support in newer versions, or we can parse it manually.
        # Let's parse the URI manually to extract host, port, database, user, and password.
        # Read the connection URI from the process environment; never hardcode credentials.
        if not connection_uri.startswith("postgresql://"):
            print("Error: Invalid Connection URI. Must start with postgresql://")
            sys.exit(1)
            
        uri_body = connection_uri[len("postgresql://"):]
        auth_part, host_part = uri_body.split("@", 1)
        user, password = auth_part.split(":", 1)
        
        host_and_port, database = host_part.split("/", 1)
        if ":" in host_and_port:
            host, port_str = host_and_port.split(":", 1)
            port = int(port_str)
        else:
            host = host_and_port
            port = 5432
            
        print(f"Host: {host}")
        print(f"Port: {port}")
        print(f"Database: {database}")
        print(f"User: {user}")
        
        conn = pg8000.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database=database
        )
        cursor = conn.cursor()
        
        print("Executing migration SQL...")
        # Execute the entire script
        # Note: pg8000 allows executing multiple statements if we run them, or we can execute them one by one.
        # PostgreSQL supports running multiple semicolon-separated statements in a single execute() call.
        cursor.execute(sql_content)
        conn.commit()
        
        # Try to fetch result if any
        try:
            res = cursor.fetchone()
            print("Result:", res)
        except Exception:
            pass
            
        print("Migration completed successfully!")
        cursor.close()
        conn.close()
        
    except Exception as e:
        print("Error running migration:", e)
        sys.exit(1)

if __name__ == "__main__":
    run_migration()

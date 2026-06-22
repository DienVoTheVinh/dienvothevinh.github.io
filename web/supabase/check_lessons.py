import pg8000
import sys

def check_columns():
    connection_uri = "postgresql://postgres:Thiendi12042021#@db.nrnokgciogxqzjqjeuwi.supabase.co:5432/postgres"
    
    # Parse URI manually
    uri_body = connection_uri[len("postgresql://"):]
    auth_part, host_part = uri_body.split("@", 1)
    user, password = auth_part.split(":", 1)
    host_and_port, database = host_part.split("/", 1)
    host, port = host_and_port.split(":", 1)
    port = int(port)
    
    conn = pg8000.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=database
    )
    cursor = conn.cursor()
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'lessons'
        ORDER BY column_name;
    """)
    rows = cursor.fetchall()
    print("=== CÁC CỘT CỦA BẢNG public.lessons ===")
    for row in rows:
        print(f"Col: {row[0]} ({row[1]})")
    
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'documents'
        ORDER BY column_name;
    """)
    rows = cursor.fetchall()
    print("\n=== CÁC CỘT CỦA BẢNG public.documents ===")
    for row in rows:
        print(f"Col: {row[0]} ({row[1]})")
        
    cursor.close()
    conn.close()

if __name__ == "__main__":
    check_columns()

import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

terms = ["halaqah", "bimbingan", "ufa", "dirosah", "gis"]
for term in terms:
    print(f"\nUnique URLs containing '{term}':")
    cursor.execute("SELECT DISTINCT parent_url FROM hierarchy WHERE parent_url LIKE ?", (f"%{term}%",))
    parents = {r[0].strip().rstrip("/") for r in cursor.fetchall() if r[0]}
    cursor.execute("SELECT DISTINCT child_url FROM hierarchy WHERE child_url LIKE ?", (f"%{term}%",))
    children = {r[0].strip().rstrip("/") for r in cursor.fetchall() if r[0]}
    
    all_urls = parents.union(children)
    print(list(all_urls)[:10])

conn.close()

import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all rows
cursor.execute("SELECT id, parent_url, child_url, title, sequence_order FROM hierarchy")
rows = cursor.fetchall()
print(f"Total rows: {len(rows)}")

# Find folders (URLs that are not archives)
cursor.execute("SELECT url FROM articles")
article_urls = {r[0].strip().rstrip("/") for r in cursor.fetchall() if r[0]}

reversed_count = 0
for r in rows:
    pid, parent, child, title, seq = r
    parent_clean = parent.strip().rstrip("/") if parent else ""
    child_clean = child.strip().rstrip("/") if child else ""
    
    is_parent_archive = parent_clean.startswith("https://ilmiyyah.com/archives/")
    is_child_archive = child_clean.startswith("https://ilmiyyah.com/archives/")
    
    # If parent is an archive and child is a folder/category page, it's reversed!
    if is_parent_archive and not is_child_archive:
        reversed_count += 1

print(f"Reversed count (Parent is archive, Child is folder): {reversed_count}")

# Check 5 primary URLs
primary_urls = [
    "https://ilmiyyah.com/halaqah-silsilah-ilmiyah",
    "https://ilmiyyah.com/bimbingan-islam",
    "https://ilmiyyah.com/kelas-ufa",
    "https://ilmiyyah.com/dirosah-islamiyah",
    "https://ilmiyyah.com/grup-islam-sunnah-gis"
]

print("\nPrimary URL mappings:")
for url in primary_urls:
    cursor.execute("SELECT parent_url, child_url, title FROM hierarchy WHERE child_url = ? OR child_url = ?", (url, url + "/"))
    as_child = cursor.fetchall()
    cursor.execute("SELECT parent_url, child_url, title FROM hierarchy WHERE parent_url = ? OR parent_url = ?", (url, url + "/"))
    as_parent = cursor.fetchall()
    print(f"\nURL: {url}")
    print(f"  Mapped as child: {len(as_child)} times (Example parents: {[ac[0] for ac in as_child[:3]]})")
    print(f"  Mapped as parent: {len(as_parent)} times (Example children: {[ap[1] for ap in as_parent[:3]]})")

conn.close()

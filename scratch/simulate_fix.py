import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all rows
cursor.execute("SELECT id, parent_url, child_url, title FROM hierarchy")
rows = cursor.fetchall()

# Simulate filtering
filtered_rows = []
removed_count = 0
for r in rows:
    rid, parent, child, title = r
    parent_clean = parent.strip().rstrip("/") if parent else ""
    child_clean = child.strip().rstrip("/") if child else ""
    
    is_parent_archive = parent_clean.startswith("https://ilmiyyah.com/archives/")
    is_child_archive = child_clean.startswith("https://ilmiyyah.com/archives/")
    
    if is_parent_archive and not is_child_archive:
        removed_count += 1
    else:
        filtered_rows.append(r)

print(f"Total rows: {len(rows)}")
print(f"Removed reversed rows: {removed_count}")
print(f"Remaining rows: {len(filtered_rows)}")

# Find folders among remaining rows
parents = {r[1].strip().rstrip("/") for r in filtered_rows if r[1]}
children = {r[2].strip().rstrip("/") for r in filtered_rows if r[2]}

# Find absolute parent folders (parents that have no parent in the remaining rows)
roots = parents - children
print(f"\nParentless category folders after cleanup ({len(roots)} total):")
for r in sorted(list(roots))[:30]:
    # Count how many children are under this folder
    cursor.execute("SELECT COUNT(*) FROM hierarchy WHERE parent_url = ? OR parent_url = ?", (r, r + "/"))
    cnt = cursor.fetchone()[0]
    print(f"  Folder: {r} ({cnt} children)")

conn.close()

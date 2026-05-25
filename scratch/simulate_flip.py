import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all rows
cursor.execute("SELECT id, parent_url, child_url, title FROM hierarchy")
rows = cursor.fetchall()

flipped_rows = []
for r in rows:
    rid, parent, child, title = r
    parent_clean = parent.strip().rstrip("/") if parent else ""
    child_clean = child.strip().rstrip("/") if child else ""
    
    is_parent_archive = parent_clean.startswith("https://ilmiyyah.com/archives/")
    is_child_archive = child_clean.startswith("https://ilmiyyah.com/archives/")
    
    # If reversed, swap parent and child
    if is_parent_archive and not is_child_archive:
        # Swap parent and child
        flipped_rows.append((rid, child, parent, title))
    else:
        flipped_rows.append(r)

print(f"Total rows: {len(rows)}")
print(f"Remaining rows after flipping: {len(flipped_rows)}")

# Find folders among remaining rows
parents = {r[1].strip().rstrip("/") for r in flipped_rows if r[1]}
children = {r[2].strip().rstrip("/") for r in flipped_rows if r[2]}

# Find absolute parent folders (roots that have no parent in the flipped rows)
roots = parents - children
print(f"\nParentless category folders after flipping ({len(roots)} total):")
for r in sorted(list(roots))[:30]:
    # Count how many children are under this folder in flipped tree
    cnt = len([x for x in flipped_rows if x[1].strip().rstrip("/") == r])
    print(f"  Folder: {r} ({cnt} direct children)")

conn.close()

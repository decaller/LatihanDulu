import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Find all active parent_urls
cursor.execute("SELECT DISTINCT parent_url FROM hierarchy WHERE parent_url IS NOT NULL AND parent_url != ''")
active_parents = {r[0].strip().rstrip("/") for r in cursor.fetchall()}

# Find all active child_urls
cursor.execute("SELECT DISTINCT child_url FROM hierarchy WHERE child_url IS NOT NULL AND child_url != ''")
active_children = {r[0].strip().rstrip("/") for r in cursor.fetchall()}

# Find absolute parentless roots
roots = active_parents - active_children

print(f"Parentless roots count: {len(roots)}")
for root in roots:
    if root == "https://ilmiyyah.com":
        continue
        
    # Determine new parent
    new_parent = "https://ilmiyyah.com"
    if root.startswith("https://ilmiyyah.com/halaqah-silsilah-ilmiyah/"):
        new_parent = "https://ilmiyyah.com/halaqah-silsilah-ilmiyah"
    elif root.startswith("https://ilmiyyah.com/bimbingan-islam/"):
        new_parent = "https://ilmiyyah.com/bimbingan-islam"
    elif root.startswith("https://ilmiyyah.com/dirosah-islamiyah/"):
        new_parent = "https://ilmiyyah.com/dirosah-islamiyah"
    elif root.startswith("https://ilmiyyah.com/grup-islam-sunnah/"):
        new_parent = "https://ilmiyyah.com/grup-islam-sunnah"
        
    # Find title from articles if available
    cursor.execute("SELECT title FROM articles WHERE url = ? OR url = ?", (root, root + "/"))
    art = cursor.fetchone()
    if art:
        title = art[0]
    else:
        title = root.split("/")[-1].replace("-", " ").title()
        
    # Insert mapping
    cursor.execute(
        "INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, 0)",
        (new_parent, root, title)
    )
    print(f"Mapped parentless category root: {title} -> {new_parent}")

# Step 5: Clean up self-referential loop rows
cursor.execute("DELETE FROM hierarchy WHERE parent_url = child_url")
conn.commit()
conn.close()

print("Alhamdulillah, all parentless roots successfully mapped!")

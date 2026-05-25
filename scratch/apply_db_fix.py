import sqlite3

db_path = "backend/data.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create a clean backup copy inside the transaction or run it
print("Reading original rows...")
cursor.execute("SELECT id, parent_url, child_url, title, sequence_order FROM hierarchy")
original_rows = cursor.fetchall()
print(f"Total hierarchy rows: {len(original_rows)}")

# Step 1: Identify and flip reversed parent/child URLs
flipped_count = 0
updates = []

for row in original_rows:
    rid, parent, child, title, seq = row
    parent_clean = parent.strip().rstrip("/") if parent else ""
    child_clean = child.strip().rstrip("/") if child else ""
    
    is_parent_archive = parent_clean.startswith("https://ilmiyyah.com/archives/")
    is_child_archive = child_clean.startswith("https://ilmiyyah.com/archives/")
    
    if is_parent_archive and not is_child_archive:
        # Swap parent and child
        updates.append((child_clean, parent_clean, title, seq, rid))
        flipped_count += 1
    else:
        # Keep as is but normalize trailing slashes
        updates.append((parent_clean, child_clean, title, seq, rid))

print(f"Flipped count: {flipped_count}")

# Execute updates
cursor.executemany(
    "UPDATE hierarchy SET parent_url = ?, child_url = ?, title = ?, sequence_order = ? WHERE id = ?",
    updates
)
conn.commit()
print("Swapped reversed parent/child rows.")

# Step 2: Remove duplicates to avoid tree builder confusion
cursor.execute("SELECT parent_url, child_url, COUNT(*) FROM hierarchy GROUP BY parent_url, child_url HAVING COUNT(*) > 1")
duplicates = cursor.fetchall()
print(f"Duplicate mapping count: {len(duplicates)}")
for dup in duplicates:
    parent, child, count = dup
    # Keep only one row for this mapping
    cursor.execute("SELECT id FROM hierarchy WHERE parent_url = ? AND child_url = ? ORDER BY id ASC", (parent, child))
    ids = [x[0] for x in cursor.fetchall()]
    for rid in ids[1:]:
        cursor.execute("DELETE FROM hierarchy WHERE id = ?", (rid,))
print("Cleared duplicate hierarchy mappings.")
conn.commit()

# Step 3: Insert the primary landing categories if they are missing
primary_categories = [
    ("https://ilmiyyah.com", "https://ilmiyyah.com/halaqah-silsilah-ilmiyah", "Halaqah Silsilah Ilmiyah", 1),
    ("https://ilmiyyah.com", "https://ilmiyyah.com/bimbingan-islam", "Bimbingan Islam", 2),
    ("https://ilmiyyah.com", "https://ilmiyyah.com/dirosah-islamiyah", "Dirosah Islamiyah", 3),
    ("https://ilmiyyah.com", "https://ilmiyyah.com/grup-islam-sunnah", "Grup Islam Sunnah (GIS)", 4),
    ("https://ilmiyyah.com", "https://ilmiyyah.com/kewajiban-menuntut-ilmu", "Kewajiban Menuntut Ilmu", 5),
]

for parent, child, title, seq in primary_categories:
    cursor.execute("SELECT id FROM hierarchy WHERE child_url = ?", (child,))
    exists = cursor.fetchone()
    if not exists:
        cursor.execute(
            "INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, ?)",
            (parent, child, title, seq)
        )
        print(f"Inserted primary category folder: {title}")
    else:
        cursor.execute("UPDATE hierarchy SET parent_url = ?, title = ? WHERE child_url = ?", (parent, title, child))
        print(f"Updated primary category folder mapping: {title}")

# Step 4: Map parentless subfolders under their respective main primary categories
# Find all unique folder child_urls (URLs not in articles table) that act as parents in hierarchy
cursor.execute("SELECT DISTINCT parent_url FROM hierarchy WHERE parent_url IS NOT NULL AND parent_url != ''")
active_parents = {r[0].strip().rstrip("/") for r in cursor.fetchall()}

cursor.execute("SELECT url FROM articles")
article_urls = {r[0].strip().rstrip("/") for r in cursor.fetchall() if r[0]}

folders = active_parents - article_urls

print(f"Total folder categories: {len(folders)}")

for folder in sorted(list(folders)):
    if folder == "https://ilmiyyah.com":
        continue
        
    # Check if folder has a parent in hierarchy
    cursor.execute("SELECT parent_url FROM hierarchy WHERE child_url = ?", (folder,))
    parent_row = cursor.fetchone()
    
    # If no parent exists, or parent is root but it belongs under a subfolder, remap it!
    if not parent_row:
        new_parent = "https://ilmiyyah.com"
        
        if folder.startswith("https://ilmiyyah.com/halaqah-silsilah-ilmiyah/"):
            new_parent = "https://ilmiyyah.com/halaqah-silsilah-ilmiyah"
        elif folder.startswith("https://ilmiyyah.com/bimbingan-islam/"):
            new_parent = "https://ilmiyyah.com/bimbingan-islam"
        elif folder.startswith("https://ilmiyyah.com/dirosah-islamiyah/"):
            new_parent = "https://ilmiyyah.com/dirosah-islamiyah"
        elif folder.startswith("https://ilmiyyah.com/grup-islam-sunnah/"):
            new_parent = "https://ilmiyyah.com/grup-islam-sunnah"
            
        # Clean folder name for title
        parts = folder.split("/")
        slug = parts[-1]
        folder_title = slug.replace("-", " ").title()
        if "sipk" in slug.lower():
            folder_title = folder_title.replace("Sipk", "SIPK")
            
        cursor.execute(
            "INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, 0)",
            (new_parent, folder, folder_title)
        )
        print(f"Mapped orphaned subfolder under category: {folder_title} -> {new_parent}")

# Step 5: Clean up empty parent_url folder entries or self-referential rows
cursor.execute("DELETE FROM hierarchy WHERE parent_url = child_url")
print("Deleted self-referential loop rows.")

conn.commit()
conn.close()
print("Alhamdulillah, database hierarchy flip and cleanup executed successfully!")

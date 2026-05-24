import sqlite3
import os
from datetime import datetime
from dotenv import load_dotenv

# Bismillah. Soft-delete old AI questions to ensure only high-quality ensemble results are active.

# Load .env
load_dotenv()

db_path = os.getenv("DB_PATH", "backend/data.db")
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

print(f"Bismillah. Starting soft-delete at {now}")

# 1. Identify questions to soft-delete:
# - status is 'buatan AI'
# - device is NOT 'Server-Prod-Ensemble' (the new high-quality one)
# - not already deleted
query = """
    UPDATE questions 
    SET deleted_at = ? 
    WHERE checked_status = 'buatan AI' 
    AND (created_on_device IS NULL OR created_on_device != 'Server-Prod-Ensemble')
    AND deleted_at IS NULL
"""

cursor.execute(query, (now,))
deleted_count = conn.total_changes

conn.commit()

print(f"Alhamdulillah. Soft-delete complete.")
print(f"Total questions soft-deleted: {deleted_count}")

# Verification counts
cursor.execute("SELECT COUNT(*) FROM questions WHERE deleted_at IS NULL")
active_total = cursor.fetchone()[0]
cursor.execute("SELECT created_on_device, COUNT(*) FROM questions WHERE deleted_at IS NULL GROUP BY created_on_device")
breakdown = cursor.fetchall()

print(f"Total Active Questions (Live): {active_total}")
print("Active Breakdown by Device:")
for device, count in breakdown:
    print(f" - {device or 'Unknown'}: {count}")

conn.close()

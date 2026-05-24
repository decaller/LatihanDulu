import sqlite3
import os
from dotenv import load_dotenv

# Bismillah. Reset AI questions to allow fresh generation with high-quality models.

# Load .env
load_dotenv()

db_path = os.getenv("DB_PATH", "backend/data.db")
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Bismillah. Starting cleanup of old AI-generated questions...")

# 1. Backup counts
cursor.execute("SELECT COUNT(*) FROM questions")
total_before = cursor.fetchone()[0]

# 2. Delete questions that were made by AI (not manually checked/refined)
# We exclude questions from the NEW ensemble to avoid double-resetting if run twice
cursor.execute("""
    DELETE FROM questions 
    WHERE checked_status = 'buatan AI' 
    AND created_on_device != 'Server-Prod-Ensemble'
""")
deleted_count = conn.total_changes

conn.commit()

cursor.execute("SELECT COUNT(*) FROM questions")
total_after = cursor.fetchone()[0]

print(f"Alhamdulillah. Cleanup complete.")
print(f"Total questions before: {total_before}")
print(f"Questions deleted: {deleted_count}")
print(f"Total questions remaining (Manual/New): {total_after}")

conn.close()

import shutil
import os
import time
from datetime import datetime

# Bismillah. Automated SQLite backup script.

DB_PATH = "/root/app/backend/data.db"
BACKUP_DIR = "/root/app/backend/backups"

def create_backup():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
        
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{BACKUP_DIR}/data_{timestamp}.db"
    
    try:
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, backup_path)
            print(f"[{datetime.now()}] Alhamdulillah, backup created: {backup_path}")
            
            # Keep only the last 20 backups to save space
            backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith("data_")])
            if len(backups) > 20:
                for old_backup in backups[:-20]:
                    os.remove(os.path.join(BACKUP_DIR, old_backup))
                    print(f"Removed old backup: {old_backup}")
        else:
            print(f"Error: Source DB not found at {DB_PATH}")
    except Exception as e:
        print(f"Backup failed: {e}")

if __name__ == "__main__":
    print("Bismillah. Backup daemon started (every 3 hours).")
    while True:
        create_backup()
        # Sleep for 3 hours
        time.sleep(3 * 3600)

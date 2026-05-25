import sqlite3
import os
import csv
import urllib.request
import re
import html
# Bismillah. Hierarchy Fix from CSV source of truth with web fallback.

DB_PATH = "backend/data.db"

def normalize_url(url):
    if not url: return ""
    url = url.strip().rstrip("/")
    if url.startswith("//"): url = "https:" + url
    elif url.startswith("/"): url = "https://ilmiyyah.com" + url
    elif not url.startswith("http") and "." in url: url = "https://ilmiyyah.com/" + url
    return url

def fetch_html_title(url):
    print(f"Fetching title for {url} from web...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            html_content = response.read().decode('utf-8', errors='ignore')
            match = re.search(r'<title>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
            if match:
                title = match.group(1).strip()
                title = html.unescape(title)
                for suffix in [" – ilmiyyah.com", " - ilmiyyah.com", " &#8211; ilmiyyah.com", " &ndash; ilmiyyah.com"]:
                    if title.endswith(suffix):
                        title = title[:-len(suffix)].strip()
                print(f"Resolved title: {title}")
                return title
    except Exception as e:
        print(f"Error fetching title for {url}: {e}")
    return None

def get_article_title(cursor, url):
    normalized = normalize_url(url)
    cursor.execute("SELECT title FROM articles WHERE url = ?", (normalized,))
    row = cursor.fetchone()
    if row and row[0]:
        return row[0]
    
    if normalized.startswith("http"):
        web_title = fetch_html_title(normalized)
        if web_title:
            cursor.execute("INSERT OR REPLACE INTO articles (url, title) VALUES (?, ?)", (normalized, web_title))
            return web_title
            
    return None

def update_hierarchy(cursor, parent_url, child_url, title, sequence_order):
    cursor.execute('''
        INSERT OR REPLACE INTO hierarchy (parent_url, child_url, title, sequence_order)
        VALUES (?, ?, ?, ?)
    ''', (parent_url, child_url, title, sequence_order))

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: DB not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    csv_path = "ilmiyyah.com links completed.csv"
    if not os.path.exists(csv_path):
        print(f"Error: CSV not found at {csv_path}")
        return

    print("Clearing old hierarchy...")
    cursor.execute("DELETE FROM hierarchy")

    root_url = "https://ilmiyyah.com"
    
    # Track virtual folders to avoid duplicates
    virtual_folders = {} # Name -> Virtual URL

    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        idx = 0
        for row in reader:
            idx += 1
            folder_name = row['Folder'].strip()
            subfolder = row['Subfolder'].strip()
            article_url = row['Article'].strip()

            # 1. Ensure Root -> Folder mapping
            folder_url = f"https://ilmiyyah.com/folder/{folder_name.lower().replace(' ', '-')}"
            if folder_url not in virtual_folders:
                update_hierarchy(cursor, root_url, folder_url, folder_name, 0)
                virtual_folders[folder_url] = folder_name

            if not article_url:
                # 2-level: Folder -> Subfolder (which is a URL)
                target_url = normalize_url(subfolder)
                title = get_article_title(cursor, target_url) or subfolder.split('/')[-1].replace('-', ' ').title()
                update_hierarchy(cursor, folder_url, target_url, title, idx)
            else:
                # 3-level: Folder -> Subfolder (Name or URL) -> Article (URL)
                if subfolder.startswith('http'):
                    subfolder_url = normalize_url(subfolder)
                    subfolder_name = get_article_title(cursor, subfolder_url) or subfolder.split('/')[-1].replace('-', ' ').title()
                else:
                    subfolder_name = subfolder
                    subfolder_url = f"{folder_url}/{subfolder_name.lower().replace(' ', '-')}"
                
                if subfolder_url not in virtual_folders:
                    update_hierarchy(cursor, folder_url, subfolder_url, subfolder_name, idx)
                    virtual_folders[subfolder_url] = subfolder_name
                
                target_url = normalize_url(article_url)
                title = get_article_title(cursor, target_url) or article_url.split('/')[-1].replace('-', ' ').title()
                update_hierarchy(cursor, subfolder_url, target_url, title, idx)

    conn.commit()
    conn.close()
    print(f"Alhamdulillah. Hierarchy rebuilt from CSV ({idx} rows processed).")

if __name__ == "__main__":
    main()

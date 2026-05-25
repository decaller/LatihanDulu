import os
import sqlite3
import httpx
import csv
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Bismillah. Advanced Scraping-Enhanced Hierarchy from CSV.

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

DB_PATH = "backend/data.db"
CSV_PATH = "ilmiyyah.com links.csv"

def normalize_url(url):
    if not url: return ""
    url = url.strip().rstrip("/")
    if url.startswith("//"): url = "https:" + url
    elif url.startswith("/"): url = "https://ilmiyyah.com" + url
    elif not url.startswith("http") and "." in url: url = "https://ilmiyyah.com/" + url
    return url

def get_soup(url):
    print(f"Fetching {url}...")
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=30.0)
        return BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return None

def get_db_title(cursor, url):
    normalized = normalize_url(url)
    cursor.execute("SELECT title FROM articles WHERE url = ?", (normalized,))
    row = cursor.fetchone()
    return row[0] if row else None

def update_hierarchy(cursor, parent_url, child_url, title, sequence_order):
    child_url = normalize_url(child_url)
    parent_url = normalize_url(parent_url)
    if not child_url or not parent_url: return
    if child_url == parent_url: return # CRITICAL: Prevent infinite recursion
    if "?" in child_url: return # Skip utility links
    
    # Prettify title if empty
    if not title or title.strip() == "":
        title = child_url.rstrip("/").split("/")[-1].replace("-", " ").title()

    cursor.execute('''
        INSERT OR REPLACE INTO hierarchy (parent_url, child_url, title, sequence_order)
        VALUES (?, ?, ?, ?)
    ''', (parent_url, child_url, title, sequence_order))

def is_audio_only(href, text):
    h = href.lower()
    t = text.lower()
    # Direct audio extensions
    if any(ext in h for ext in ['.mp3', '.wav', '.m4a', '.ogg']):
        return True
    # Keywords in text (allowing for variations like "Download Audio")
    if any(kw in t for kw in ['audio', 'download', 'unduh', 'mp3']):
        return True
    # Keywords in URL path
    if any(kw in h for kw in ['/audio/', '/download/']):
        return True
    return False

def is_audio_only_page(soup, url):
    """Checks if a page is purely for audio sessions/playlists with minimal article text."""
    # Hard skip list for confirmed audio-only pages
    hard_skip = ['10358', '10382', '8430', '4793', '4812', '4790', '4786', '9891', '5532', '6832']
    if any(sid in url for kw in hard_skip for sid in [kw]):
        return True

    if not soup: return False
    
    # Check for WP Audio Playlists
    has_playlist = soup.find(class_='wp-playlist') or soup.find(class_='wp-audio-playlist')
    
    # Check text content length
    content = soup.find(class_='entry-content') or soup.find('article')
    text_len = len(content.get_text(strip=True)) if content else 0
    
    # If it has a playlist and very little text, it's audio-only
    if has_playlist and text_len < 2000:
        return True
        
    return False

def scrape_and_add_children(cursor, parent_url, index_url):
    """Fetches an index page and adds all its article links as children."""
    soup = get_soup(index_url)
    if not soup: return
    
    if is_audio_only_page(soup, index_url):
        print(f"Skipping audio-only page: {index_url}")
        return

    # Look for links in the main content area primarily
    content = soup.find(class_='entry-content') or soup.find('article') or soup.body
    if not content: return
    
    links = content.find_all('a', href=True)
    found_any = False
    idx = 1
    seen_hrefs = set()
    
    for link in links:
        href = link.get('href', '')
        link_text = link.get_text(strip=True)
        
        if not href: continue
        normalized_href = normalize_url(href)
        
        if normalized_href in seen_hrefs: continue
        if normalized_href == normalize_url(index_url): continue 
        seen_hrefs.add(normalized_href)
        
        if 'ilmiyyah.com' not in href: continue
        if any(x in href for x in ['#comment-', '/feed/', '/tag/', '/category/', '/wp-admin', '?replytocom']): continue
        
        if is_audio_only(href, link_text): continue
        if len(link_text) < 4: continue
        
        # HEURISTIC: To avoid "Latest Posts" noise, only accept links that:
        # 1. Contain "Halaqah", "Materi", "Bab", or a digit
        # 2. OR are inside a list (li) or table
        t_low = link_text.lower()
        is_seq_lesson = any(kw in t_low for kw in ['halaqah', 'materi', 'bab', 'pelajaran', 'pendahuluan', 'pengantar']) or any(char.isdigit() for char in link_text)
        
        if not is_seq_lesson:
            # Maybe it's a series title? Check if it's long enough
            if len(t_low.split()) < 3: continue

        # Skip common menu noise
        if any(t in t_low for t in ['beranda', 'home', 'donasi', 'audio', 'baca juga', 'klik di sini']): continue

        db_title = get_db_title(cursor, normalized_href)
        title = db_title if db_title else link_text
        
        update_hierarchy(cursor, index_url, normalized_href, title, idx)
        found_any = True
        idx += 1
    
    if not found_any:
        print(f"Warning: No valid lesson links found on {index_url}")

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: DB not found at {DB_PATH}")
        return
    if not os.path.exists(CSV_PATH):
        print(f"Error: CSV not found at {CSV_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Clearing old hierarchy...")
    cursor.execute("DELETE FROM hierarchy")

    root_url = "https://ilmiyyah.com"
    virtual_folders = {} # Name/URL -> True

    with open(CSV_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            folder_name = row['Folder'].strip()
            subfolder_raw = row['Subfolder'].strip()
            article_url = row['Article'].strip()

            # 1. Level 1: Root -> Folder
            folder_url = f"https://ilmiyyah.com/folder/{folder_name.lower().replace(' ', '-')}"
            if folder_url not in virtual_folders:
                update_hierarchy(cursor, root_url, folder_url, folder_name, 0)
                virtual_folders[folder_url] = True

            # 2. Level 2: Folder -> Subfolder
            is_subfolder_link = subfolder_raw.startswith("http")
            
            if is_subfolder_link:
                index_url = normalize_url(subfolder_raw)
                
                if index_url not in virtual_folders:
                    soup = get_soup(index_url)
                    
                    # New: Check if this "subfolder" link is actually just an audio-only page
                    if is_audio_only_page(soup, index_url):
                        print(f"Skipping audio-only subfolder link: {index_url}")
                        continue

                    title = "Index"
                    if soup:
                        title_tag = soup.find('h1', class_='entry-title')
                        if title_tag:
                            title = title_tag.get_text(strip=True)
                        else:
                            title = get_db_title(cursor, index_url) or index_url.split('/')[-1].replace('-', ' ').title()
                    
                    update_hierarchy(cursor, folder_url, index_url, title, 0)
                    virtual_folders[index_url] = True
                    
                    # Scrape this index for articles
                    scrape_and_add_children(cursor, index_url, index_url)
            else:
                # Subfolder is a label
                subfolder_name = subfolder_raw
                subfolder_url = f"{folder_url}/{subfolder_name.lower().replace(' ', '-')}"
                
                if subfolder_url not in virtual_folders:
                    update_hierarchy(cursor, folder_url, subfolder_url, subfolder_name, 0)
                    virtual_folders[subfolder_url] = True
                
                if article_url:
                    target_url = normalize_url(article_url)
                    
                    # We should really check if target_url is audio-only too
                    # (Simplified: if title contains 'audio' or URL ends in .mp3, skip)
                    if is_audio_only(target_url, ""):
                        print(f"Skipping audio article link: {target_url}")
                        continue
                        
                    title = get_db_title(cursor, target_url) or article_url.split('/')[-1].replace('-', ' ').title()
                    update_hierarchy(cursor, subfolder_url, target_url, title, 0)

    conn.commit()
    conn.close()
    print("\nAlhamdulillah. Scraping-enhanced hierarchy rebuilt successfully.")

if __name__ == "__main__":
    main()

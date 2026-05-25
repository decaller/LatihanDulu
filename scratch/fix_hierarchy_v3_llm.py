import os
import sqlite3
import httpx
import csv
import json
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Bismillah. LLM-Enhanced Hierarchy System (v3.5).
# Robust content extraction and noise-resilient classification.

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

DB_PATH = "backend/data.db"
CSV_PATH = "ilmiyyah.com links.csv"
OLLAMA_URL = "http://100.121.116.17:11434"
CLASSIFIER_MODEL = "llama3.2:3b"

def normalize_url(url):
    if not url: return ""
    url = url.strip().rstrip("/")
    if url.startswith("//"): url = "https:" + url
    elif url.startswith("/"): url = "https://ilmiyyah.com" + url
    elif not url.startswith("http"):
        url = "https://ilmiyyah.com/" + url.lstrip("/")
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

def get_clean_content(soup):
    """Extracts the main content area while removing known noise areas."""
    if not soup: return None
    
    # 1. Create a copy to avoid mutating original
    body = soup.find('body')
    if not body: return None
    
    # 2. Identify potential content area
    content = body.find('article') or body.find(class_='entry-content') or body.find('main') or body
    
    # 3. Aggressively remove noise elements from THIS area
    for noise in content.select('header, footer, aside, .sidebar, .comments-area, .nav, .menu, script, style, .ast-footer-overlay'):
        noise.decompose()
        
    return content

def classify_page(soup, url, content):
    if not soup or not content: return "unknown"
    
    title = soup.find('h1').get_text(strip=True) if soup.find('h1') else url
    text_content = content.get_text(strip=True)
    text_len = len(text_content)
    
    # Analyze links specifically within the CLEAN content area
    all_links = content.find_all('a', href=True)
    lesson_links = []
    for l in all_links:
        href = l.get('href')
        if ('ilmiyyah.com/archives/' in href or '/halaqah-' in href) and not href.endswith('.mp3'):
            lesson_links.append(href)
    
    link_count = len(set(lesson_links))
    
    # Specific audio markers
    has_wp_playlist = bool(soup.find(class_='wp-playlist') or soup.find(class_='wp-audio-playlist'))
    has_audio_players = len(soup.find_all(class_='mejs-container')) > 0
    
    prompt = f"""
    Analyze this page for an Islamic study site and classify as ONE type:
    
    - 'folder_page': An INDEX/COLLECTION page. It lists many links to lessons or other articles.
    - 'audio_page': Primarily an AUDIO post. Focus is on a recording/playlist with minimal article text.
    - 'article_page': A content page with the actual TEXT transcript or long article for one lesson.

    GUIDELINES:
    - If Link Count > 10, it's almost certainly a 'folder_page'.
    - If Text Length is very small (< 1500 chars) AND has an Audio Playlist/Player, it's 'audio_page'.
    - Otherwise, if it has long text, it's 'article_page'.

    DATA:
    Title: {title}
    Link Count: {link_count}
    Has Audio Playlist: {has_wp_playlist}
    Has Audio Players: {has_audio_players}
    Text Length: {text_len} chars
    Text Snippet: {text_content[:1500]}

    Return JSON: {{"type": "folder_page" | "article_page" | "audio_page"}}
    """
    
    try:
        resp = httpx.post(f"{OLLAMA_URL}/api/generate", json={
            "model": CLASSIFIER_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }, timeout=30.0)
        res_json = json.loads(resp.json()['response'])
        ptype = res_json.get('type', 'unknown')
        print(f"  Classification: {ptype} (Links: {link_count}, Text: {text_len})")
        return ptype
    except Exception as e:
        print(f"  LLM failed, using fallback. Error: {e}")
        if link_count > 8: return "folder_page"
        if has_wp_playlist and text_len < 2000: return "audio_page"
        return "article_page"

def update_hierarchy(cursor, parent_url, child_url, title, sequence_order):
    child_url = normalize_url(child_url)
    parent_url = normalize_url(parent_url)
    if not child_url or not parent_url or child_url == parent_url: return
    if "?" in child_url or "wp-content" in child_url: return
    
    if not title or title.strip() == "":
        title = child_url.rstrip("/").split("/")[-1].replace("-", " ").title()

    cursor.execute('''
        INSERT OR REPLACE INTO hierarchy (parent_url, child_url, title, sequence_order)
        VALUES (?, ?, ?, ?)
    ''', (parent_url, child_url, title, sequence_order))

def scrape_lessons(cursor, parent_url, index_url, content):
    if not content: return
    
    links = content.find_all('a', href=True)
    idx = 1
    seen = set()
    count = 0
    
    for link in links:
        href = link.get('href', '')
        text = link.get_text(strip=True)
        if not href: continue
        
        normalized = normalize_url(href)
        if normalized in seen or normalized == normalize_url(index_url): continue
        seen.add(normalized)
        
        # Site filters
        if 'ilmiyyah.com' not in href: continue
        if any(x in href for x in ['/tag/', '/category/', '/wp-admin', '#comment-', '?replytocom']): continue
        if any(href.lower().endswith(ext) for ext in ['.mp3', '.pdf', '.zip']): continue
        
        # Relevance: Must look like a lesson or be an archive link
        t_low = text.lower()
        is_lesson = '/archives/' in href or '/halaqah-' in href or \
                    any(kw in t_low for kw in ['halaqah', 'materi', 'bab', 'pelajaran']) or \
                    any(c.isdigit() for c in text)
        
        if not is_lesson: continue
        if any(t in t_low for t in ['beranda', 'home', 'donasi', 'audio', 'kontak']): continue

        db_title = get_db_title(cursor, normalized)
        title = db_title if db_title else text
        if not title or len(title) < 2: continue
        
        update_hierarchy(cursor, parent_url, normalized, title, idx)
        count += 1
        idx += 1
    print(f"  Scraped {count} links from index.")

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Bismillah. Rebuild v3.5 (Noise-Resilient Content Scoping)...")
    cursor.execute("DELETE FROM hierarchy")

    root_url = "https://ilmiyyah.com"
    processed_urls = {}

    with open(CSV_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            folder_name = row['Folder'].strip()
            subfolder_raw = row['Subfolder'].strip()
            article_url = row['Article'].strip()

            folder_url = f"https://ilmiyyah.com/folder/{folder_name.lower().replace(' ', '-')}"
            if folder_url not in processed_urls:
                update_hierarchy(cursor, root_url, folder_url, folder_name, 0)
                processed_urls[folder_url] = "root"

            if subfolder_raw.startswith("http"):
                index_url = normalize_url(subfolder_raw)
                
                if index_url not in processed_urls:
                    soup = get_soup(index_url)
                    content = get_clean_content(soup)
                    
                    page_type = classify_page(soup, index_url, content)
                    processed_urls[index_url] = page_type
                    
                    if page_type == "audio_page":
                        print(f"  SKIPPING Audio-Only: {index_url}")
                        continue
                    
                    title_tag = soup.find('h1') if soup else None
                    title = title_tag.get_text(strip=True) if title_tag else (get_db_title(cursor, index_url) or index_url.split('/')[-1].replace('-', ' ').title())
                    update_hierarchy(cursor, folder_url, index_url, title, 0)
                    
                    if page_type == "folder_page":
                        scrape_lessons(cursor, index_url, index_url, content)
            else:
                # Subfolder Label
                subfolder_name = subfolder_raw
                subfolder_url = f"{folder_url}/{subfolder_name.lower().replace(' ', '-')}"
                
                if subfolder_url not in processed_urls:
                    update_hierarchy(cursor, folder_url, subfolder_url, subfolder_name, 0)
                    processed_urls[subfolder_url] = "folder"
                
                if article_url:
                    target_url = normalize_url(article_url)
                    if not target_url.endswith('.mp3'):
                        title = get_db_title(cursor, target_url) or article_url.split('/')[-1].replace('-', ' ').title()
                        update_hierarchy(cursor, subfolder_url, target_url, title, 0)

    conn.commit()
    conn.close()
    print("\nAlhamdulillah. Rebuild completed.")

if __name__ == "__main__":
    main()

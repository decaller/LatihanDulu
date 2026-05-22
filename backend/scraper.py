# /// script
# dependencies = [
#     "httpx",
#     "beautifulsoup4",
# ]
# ///

import os
import sys
import sqlite3
import httpx
import time
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urljoin, urlparse

# Global client headers
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Max depth for BFS traversal to prevent infinite loops
MAX_DEPTH = 5

def init_db(conn):
    cursor = conn.cursor()
    # 1. State-based Crawl Queue for robust BFS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS crawl_queue (
            url TEXT PRIMARY KEY,
            status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
            depth INTEGER DEFAULT 0,
            error_message TEXT,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP
        )
    ''')
    # 2. Articles table for full transcription detail
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE,
            title TEXT,
            silsilah TEXT,
            speaker TEXT,
            audio_url TEXT,
            content TEXT,
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 3. Hierarchy table to map all tree relationships
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hierarchy (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_url TEXT,
            child_url TEXT,
            title TEXT,
            sequence_order INTEGER,
            UNIQUE(parent_url, child_url)
        )
    ''')
    # 4. View to connect both tables explicitly
    cursor.execute('''
        CREATE VIEW IF NOT EXISTS lecture_hierarchy AS
        SELECT 
            h.id AS hierarchy_id,
            h.parent_url,
            h.child_url,
            h.title AS hierarchy_title,
            h.sequence_order,
            a.title AS article_title,
            a.speaker,
            a.audio_url,
            a.content
        FROM hierarchy h
        LEFT JOIN articles a ON h.child_url = a.url
    ''')
    conn.commit()

def normalize_url(url):
    """Normalize and clean URL to avoid duplicates and loops."""
    if not url:
        return ""
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    elif url.startswith("/"):
        url = "https://ilmiyyah.com" + url
    elif not url.startswith("http"):
        url = "https://ilmiyyah.com/" + url

    parsed = urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc == "www.ilmiyyah.com":
        netloc = "ilmiyyah.com"
    if not netloc:
        netloc = "ilmiyyah.com"

    path = parsed.path
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    if not path:
        path = "/"

    # Strip query parameters (except non-utility ones if any)
    query = ""
    if parsed.query:
        query_parts = []
        for part in parsed.query.split('&'):
            if '=' in part:
                key, val = part.split('=', 1)
                if key.lower() not in ['print', 'share', 'pdf', 'wp-playlist-format', 'replytocom', 'share_whatsapp', 'share_facebook', 'share_twitter', 'share_telegram']:
                     query_parts.append(part)
            else:
                if part.lower() not in ['print', 'pdf', 'share']:
                     query_parts.append(part)
        if query_parts:
            query = "?" + '&'.join(query_parts)

    return f"https://{netloc}{path}{query}"

def extract_valid_links(parent_url, soup):
    """Extract and filter target links from content body only."""
    # Look for main content container to avoid sidebar/header/footer link cycles
    content = soup.find(class_='entry-content') or soup.find('main') or soup.find(id='content') or soup
    
    raw_links = []
    
    # Try parsing tables (main indexes)
    tables = content.find_all('table')
    lists = content.find_all(['ul', 'ol'])
    
    if tables:
        for table in tables:
            for row in table.find_all('tr'):
                cols = row.find_all(['td', 'th'])
                if cols:
                    cell_links = cols[0].find_all('a')
                    for link in cell_links:
                        raw_links.append((link.get_text(strip=True), link.get('href')))
    elif lists:
        for lst in lists:
            for item in lst.find_all('li'):
                link = item.find('a')
                if link:
                    raw_links.append((item.get_text(strip=True), link.get('href')))
    else:
        for link in content.find_all('a'):
            raw_links.append((link.get_text(strip=True), link.get('href')))

    valid_links = []
    seen = set()
    for text, href in raw_links:
        if not href:
            continue
        child_url = urljoin(parent_url, href)
        child_url = normalize_url(child_url)

        # Basic exclusions
        if not child_url.startswith("https://ilmiyyah.com"):
            continue
        if child_url == parent_url or child_url.rstrip('/') == parent_url.rstrip('/'):
            continue
            
        # Path filtering to keep only study materials
        if any(x in child_url for x in [
            '/wp-admin/', '/wp-content/', '/wp-includes/', '/feed/', '/author/', '/tag/', 
            '/category/', '/comments/', '/replytocom=', '/tentang-kami', '/hubungi-kami', 
            '/donasi', '/syarat-ketentuan', '/kebijakan-privasi'
        ]):
            continue
            
        # Extension exclusions
        if any(child_url.lower().endswith(ext) for ext in ['.pdf', '.mp3', '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar', '.docx']):
            continue

        if child_url in seen:
            continue
            
        seen.add(child_url)
        # Clean title text
        title = text.replace('\n', ' ').strip()
        if not title:
            title = child_url.rstrip('/').split('/')[-1].replace('-', ' ').title()

        valid_links.append((title, child_url))

    return valid_links

def scrape_article_data(url, soup):
    """Extract article transcript, audio, and metadata from beautiful soup object."""
    # Title
    title_tag = soup.find('h1', class_='entry-title')
    title = title_tag.get_text(strip=True) if title_tag else "Unknown Title"
    
    # Entry content
    entry_content = soup.find(class_='entry-content') or soup.find('main') or soup.find(id='content') or soup
    
    # Audio tag
    audio_tag = entry_content.find('audio')
    audio_url = ""
    if audio_tag:
        audio_url = audio_tag.get('src') or ""
        if not audio_url:
            # Check source tags inside audio
            source_tag = audio_tag.find('source')
            if source_tag:
                audio_url = source_tag.get('src') or ""

    # Parse silsilah & speaker
    silsilah = ""
    silsilah_link = entry_content.find('a', href=lambda h: h and 'halaqah-silsilah' in h)
    if silsilah_link:
        silsilah = silsilah_link.get_text(strip=True)
    else:
        for p in entry_content.find_all('p'):
            text = p.get_text()
            if 'Silsilah:' in text:
                for line in text.splitlines():
                    if 'Silsilah:' in line:
                        silsilah = line.replace('Silsilah:', '').strip()
                        break
                break
                
    speaker = "Ustadz Dr. Abdullah Roy, M.A"
    for p in entry_content.find_all('p'):
        text = p.get_text()
        if 'Audio:' in text:
            for line in text.splitlines():
                if 'Audio:' in line:
                    speaker = line.replace('Audio:', '').strip()
                    break
            break

    # Paragraph paragraphs
    paragraphs = []
    for p in entry_content.find_all('p'):
        text = p.get_text('\n', strip=True)
        if 'Silsilah:' in text or 'Audio:' in text or 'Transkrip:' in text:
            continue
        if p.find('img'):
            continue
        if text:
            paragraphs.append(text)
            
    content = "\n\n".join(paragraphs)
    
    return {
        "url": url,
        "title": title,
        "silsilah": silsilah,
        "speaker": speaker,
        "audio_url": audio_url,
        "content": content
    }

def generate_hierarchy_tree_report(db_path, report_path):
    """Generate comprehensive hierarchical report from database."""
    print(f"Generating Tree Report: {report_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT parent_url, child_url, title, sequence_order FROM hierarchy ORDER BY parent_url, sequence_order")
    rows = cursor.fetchall()
    
    cursor.execute("SELECT url, title, audio_url FROM articles")
    scraped_articles = {r[0]: (r[1], r[2]) for r in cursor.fetchall()}
    conn.close()
    
    tree = {}
    titles = {}
    for parent_url, child_url, title, seq in rows:
        p_clean = parent_url.rstrip('/')
        c_clean = child_url.rstrip('/')
        if p_clean not in tree:
            tree[p_clean] = []
        tree[p_clean].append((child_url, title))
        titles[c_clean] = title
        
    root = "https://ilmiyyah.com"
    titles[root] = "ilmiyyah.com (Root)"
    
    visited = set()
    
    def render_node(url, depth=0):
        url_clean = url.rstrip('/')
        indent = "  " * depth
        lines = []
        
        node_title = titles.get(url_clean, url)
        article_info = scraped_articles.get(url) or scraped_articles.get(url_clean)
        
        if article_info:
            lines.append(f"{indent}- **[LEAF]** [{node_title}]({url}) 🎙️ *(Audio scraped)*")
        else:
            lines.append(f"{indent}- **[NODE]** [{node_title}]({url})")
            
        children = tree.get(url_clean, [])
        # Prevent infinite loop if cyclic links are present
        if url_clean in visited:
            return [f"{indent}- **[CYCLE LOOP]** [{node_title}]({url})"]
        visited.add(url_clean)
            
        for child_url, child_title in children:
            lines.extend(render_node(child_url, depth + 1))
            
        return lines

    tree_lines = render_node(root, 0)
    
    report_content = f"""# Comprehensive ilmiyyah.com Hierarchy Map
Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

This report maps the recursively crawled multi-level study portal structure:
- **Level 0**: Web root (`https://ilmiyyah.com/`)
- **Level 1**: Hub pages / categories
- **Level 2**: Course/Series directories
- **Level 3**: Lecture articles and audio transcriptions

---

## Database Schema Connection

The two tables are structurally connected via the SQL VIEW `lecture_hierarchy`. This allows seamless joining of parent-child relationships with leaf transcripts:

```sql
CREATE VIEW lecture_hierarchy AS
SELECT 
    h.id AS hierarchy_id,
    h.parent_url,
    h.child_url,
    h.title AS hierarchy_title,
    h.sequence_order,
    a.title AS article_title,
    a.speaker,
    a.audio_url,
    a.content
FROM hierarchy h
LEFT JOIN articles a ON h.child_url = a.url;
```

---

## Visual Study Tree

{chr(10).join(tree_lines)}

---

## Database Summary
- **Total Tree Link Nodes**: {len(rows)}
- **Total Scraped Leaf Articles**: {len(scraped_articles)}
- **Explicit Connection View**: `lecture_hierarchy` VIEW active
"""
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)
    print("Tree report successfully generated.")

def main():
    print("Bismillah. Initiating recursive BFS queue crawler.")
    db_file = os.path.join(os.path.dirname(__file__), "data.db")
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    report_file = os.path.join(project_root, "log", "hierarchy_report.md")
    
    conn = sqlite3.connect(db_file)
    init_db(conn)
    
    # Seed the queue with the root url at depth 0
    cursor = conn.cursor()
    root_url = normalize_url("https://ilmiyyah.com")
    
    cursor.execute("SELECT count(*) FROM crawl_queue")
    queue_count = cursor.fetchone()[0]
    if queue_count == 0:
        cursor.execute("INSERT OR IGNORE INTO crawl_queue (url, depth, status) VALUES (?, 0, 'pending')", (root_url,))
        conn.commit()
        print(f"Seeded BFS crawl queue with root: {root_url}")
        
    while True:
        # Fetch the next pending URL from the database
        cursor.execute("SELECT url, depth FROM crawl_queue WHERE status = 'pending' ORDER BY depth ASC, added_at ASC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            print("Crawl queue is empty. Crawl complete!")
            break
            
        current_url, current_depth = row
        print(f"\n--- Processing [{current_depth}]: {current_url} ---")
        
        # Mark as processing
        cursor.execute("UPDATE crawl_queue SET status = 'processing' WHERE url = ?", (current_url,))
        conn.commit()
        
        try:
            time.sleep(0.1) # Respectful rate limit delay
            response = httpx.get(current_url, headers=HEADERS, follow_redirects=True, timeout=20.0)
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}")
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Check if page is an Article Leaf (contains audio tag)
            audio_tag = soup.find('audio')
            is_leaf = audio_tag is not None
            
            if is_leaf:
                print(f"  -> Classified as Leaf. Scraping article...")
                article_data = scrape_article_data(current_url, soup)
                
                # Save to articles table
                cursor.execute('''
                    INSERT OR REPLACE INTO articles (url, title, silsilah, speaker, audio_url, content)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (article_data["url"], article_data["title"], article_data["silsilah"], article_data["speaker"], article_data["audio_url"], article_data["content"]))
                conn.commit()
                print(f"  -> Saved article: {article_data['title']}")
                
            # Always extract outbound links from index pages, and also check if a leaf has sub-links (like a series index page that has audio)
            # Find and add child links to hierarchy and crawl queue
            outbound_links = extract_valid_links(current_url, soup)
            print(f"  -> Extracted {len(outbound_links)} candidate outbound links.")
            
            valid_children_count = 0
            for idx, (title, child_url) in enumerate(outbound_links):
                child_depth = current_depth + 1
                if child_depth > MAX_DEPTH:
                    continue
                    
                # Query depth of this child from crawl_queue if it exists
                cursor.execute("SELECT depth FROM crawl_queue WHERE url = ?", (child_url,))
                child_row = cursor.fetchone()
                
                if child_row:
                    existing_depth = child_row[0]
                    # Backlink/crosslink prevention: only allow if current crawl path depth is strictly shorter
                    if existing_depth <= current_depth:
                        continue
                else:
                    # New link: Insert into queue at child_depth
                    cursor.execute("INSERT OR IGNORE INTO crawl_queue (url, depth, status) VALUES (?, ?, 'pending')", (child_url, child_depth))
                    
                # Insert / replace parent-child hierarchy mapping
                cursor.execute('''
                    INSERT OR REPLACE INTO hierarchy (parent_url, child_url, title, sequence_order)
                    VALUES (?, ?, ?, ?)
                ''', (current_url, child_url, title, idx + 1))
                valid_children_count += 1
                
            conn.commit()
            print(f"  -> Added {valid_children_count} unique children to hierarchy and queue.")
            
            # Mark URL as completed
            cursor.execute("UPDATE crawl_queue SET status = 'completed', processed_at = CURRENT_TIMESTAMP WHERE url = ?", (current_url,))
            conn.commit()
            
        except Exception as e:
            error_msg = str(e)
            print(f"  -> Failed: {error_msg}")
            cursor.execute("UPDATE crawl_queue SET status = 'failed', error_message = ?, processed_at = CURRENT_TIMESTAMP WHERE url = ?", (error_msg, current_url))
            conn.commit()
            
    conn.close()
    
    # 5. Generate final tree report
    generate_hierarchy_tree_report(db_file, report_file)
    print("\nAlhamdulillah, site-wide crawling and mapping completed successfully!")

if __name__ == "__main__":
    main()

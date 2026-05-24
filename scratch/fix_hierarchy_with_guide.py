import os
import sqlite3
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Bismillah. Advanced Hierarchy Fix based on User Guide.

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

DB_PATH = "backend/data.db"

def normalize_url(url):
    if not url: return ""
    url = url.strip().rstrip("/")
    if url.startswith("//"): url = "https:" + url
    elif url.startswith("/"): url = "https://ilmiyyah.com" + url
    elif not url.startswith("http"): url = "https://ilmiyyah.com/" + url
    return url

def get_soup(url):
    print(f"Fetching {url}...")
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=30.0)
        return BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return None

def update_hierarchy(cursor, parent_url, child_url, title, sequence_order):
    child_url = normalize_url(child_url)
    parent_url = normalize_url(parent_url)
    if not child_url or not parent_url: return
    if "?" in child_url: return # Skip utility links with queries
    if not title or title.strip() == "": 
        title = child_url.rstrip("/").split("/")[-1].replace("-", " ").title()
    
    cursor.execute('''
        INSERT OR REPLACE INTO hierarchy (parent_url, child_url, title, sequence_order)
        VALUES (?, ?, ?, ?)
    ''', (parent_url, child_url, title, sequence_order))

def process_index_page(cursor, url, parent_folder_url):
    """Generic helper to treat a sub-index as a folder and extract its halaqahs."""
    soup = get_soup(url)
    if not soup: return
    
    # Treat current url as a sub-folder under parent_folder_url
    title_tag = soup.find('h1', class_='entry-title')
    title = title_tag.get_text(strip=True) if title_tag else url.split('/')[-1].title()
    update_hierarchy(cursor, parent_folder_url, url, title, 0)
    
    # Extract links from this page as children of this sub-folder
    content = soup.find(class_='entry-content')
    if content:
        links = content.find_all('a')
        for i, link in enumerate(links):
            href = link.get('href', '')
            link_text = link.get_text(strip=True)
            if not href or href.endswith('.mp3') or link_text.lower() == 'audio': continue
            if any(x in href for x in ['/tag/', '/category/', '/wp-admin']): continue
            if not href.startswith('http'): continue
            
            update_hierarchy(cursor, url, href, link_text, i + 1)

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Clearing old hierarchy...")
    cursor.execute("DELETE FROM hierarchy")

    root_url = "https://ilmiyyah.com"

    # 1. Homepage -> Kutub
    print("\n--- Processing Kutub ---")
    kutub_folder = "https://ilmiyyah.com/kutub"
    update_hierarchy(cursor, root_url, kutub_folder, "Kutub", 1)
    
    soup = get_soup("https://ilmiyyah.com/")
    if soup:
        table = soup.find('table', id='myTable')
        if table:
            links = table.find_all('a')
            for i, link in enumerate(links):
                # These are usually series indexes, so we could recurse if needed
                # For now, just add them as children of Kutub
                update_hierarchy(cursor, kutub_folder, link.get('href'), link.get_text(strip=True), i + 1)

    # 2. Halaqah Silsilah Ilmiyah
    print("\n--- Processing Halaqah Silsilah Ilmiyah ---")
    hsi_folder = "https://ilmiyyah.com/halaqah-silsilah-ilmiyah-folder"
    update_hierarchy(cursor, root_url, hsi_folder, "Halaqah Silsilah Ilmiyah", 2)
    
    soup = get_soup("https://ilmiyyah.com/halaqah-silsilah-ilmiyah")
    if soup:
        table = soup.find('table', id='myTable')
        if table:
            links = table.find_all('a')
            for i, link in enumerate(links):
                # Recurse into each series
                process_index_page(cursor, link.get('href'), hsi_folder)

    # 3. Bimbingan Islam
    print("\n--- Processing Bimbingan Islam ---")
    bi_folder = "https://ilmiyyah.com/bimbingan-islam-folder"
    update_hierarchy(cursor, root_url, bi_folder, "Bimbingan Islam", 3)
    
    soup = get_soup("https://ilmiyyah.com/bimbingan-islam")
    if soup:
        content = soup.find(class_='entry-content')
        if content:
            accordions = content.find_all(class_='su-accordion')
            idx = 1
            for acc in accordions:
                spoilers = acc.find_all(class_='su-spoiler', recursive=False)
                for spoiler in spoilers:
                    title_div = spoiler.find(class_='su-spoiler-title')
                    if title_div:
                        title_text = title_div.get_text(strip=True)
                        spoiler_id = normalize_url(f"{bi_folder}/{title_text.lower().replace(' ', '-')}")
                        update_hierarchy(cursor, bi_folder, spoiler_id, title_text, idx)
                        idx += 1
                        
                        s_content = spoiler.find(class_='su-spoiler-content')
                        if s_content:
                            s_links = s_content.find_all('a')
                            for j, link in enumerate(s_links):
                                # If it's a sub-index, recurse? Or just link?
                                # BI accordions usually link directly to halaqahs.
                                update_hierarchy(cursor, spoiler_id, link.get('href'), link.get_text(strip=True), j + 1)
            
            all_links = content.find_all('a')
            for link in all_links:
                if not link.find_parent(class_='su-accordion'):
                    href = link.get('href', '')
                    if any(x in href for x in ['/wp-admin', '/tag/', '/category/']): continue
                    if not href.startswith('http'): continue
                    # Recurse if it looks like an index
                    process_index_page(cursor, href, bi_folder)
                    idx += 1

    # 4. Kelas UFA
    print("\n--- Processing Ustad Firanda Andirja ---")
    ufa_folder = "https://ilmiyyah.com/ustadz-firanda-andirja"
    update_hierarchy(cursor, root_url, ufa_folder, "Ustad Firanda Andirja", 4)
    
    soup = get_soup("https://ilmiyyah.com/kelas-ufa")
    if soup:
        content = soup.find(class_='entry-content')
        if content:
            links = content.find_all('a')
            for i, link in enumerate(links):
                href = link.get('href', '')
                if not href or href.endswith('.mp3') or link.get_text(strip=True).lower() == 'audio': continue
                if any(x in href for x in ['/tag/', '/category/']): continue
                process_index_page(cursor, href, ufa_folder)

    # 5. Dirosah Islamiyah
    print("\n--- Processing Dirosah Islamiyah ---")
    di_folder = "https://ilmiyyah.com/dirosah-islamiyah-folder"
    update_hierarchy(cursor, root_url, di_folder, "Dirosah Islamiyah", 5)
    
    soup = get_soup("https://ilmiyyah.com/dirosah-islamiyah")
    if soup:
        content = soup.find(class_='entry-content')
        if content:
            links = content.find_all('a')
            for i, link in enumerate(links):
                process_index_page(cursor, link.get('href'), di_folder)

    # 6. Group Islam Sunnah
    print("\n--- Processing Group Islam Sunnah ---")
    gis_folder = "https://ilmiyyah.com/group-islam-sunnah"
    update_hierarchy(cursor, root_url, gis_folder, "Group Islam Sunnah", 6)
    
    soup = get_soup("https://ilmiyyah.com/grup-islam-sunnah-gis")
    if soup:
        content = soup.find(class_='entry-content')
        if content:
            links = content.find_all('a')
            for i, link in enumerate(links):
                process_index_page(cursor, link.get('href'), gis_folder)

    conn.commit()
    conn.close()
    print("\nAlhamdulillah. Hierarchy rebuilt successfully.")

if __name__ == "__main__":
    main()

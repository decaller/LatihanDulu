import fs from 'fs';
import path from 'path';

// Bismillah. Scrape titles for completed CSV directly from the website.

const csvInputPath = '/home/abuhafi/Project/TesDeen/ilmiyyah.com links completed.csv';
const csvOutputPath = '/home/abuhafi/Project/TesDeen/ilmiyyah.com links completed.csv';
const cachePath = '/home/abuhafi/Project/TesDeen/scratch/title_cache.json';

// Simple helper to parse CSV line while handling quotes
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Format CSV fields properly
function toCsvRow(folder, subfolder, subfolderTitle, article, articleTitle, status) {
  const escapeCsv = (str) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return `${escapeCsv(folder)},${escapeCsv(subfolder)},${escapeCsv(subfolderTitle)},${escapeCsv(article)},${escapeCsv(articleTitle)},${escapeCsv(status)}`;
}

// Normalize URLs to match consistent formats
function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } else if (url.startsWith('/')) {
    url = 'https://ilmiyyah.com' + url;
  }
  
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname === 'www.ilmiyyah.com') {
      hostname = 'ilmiyyah.com';
    }
    let pathname = parsed.pathname;
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname) pathname = '/';
    return `https://${hostname}${pathname}`;
  } catch (e) {
    return url.replace(/\/$/, '');
  }
}

// Decode HTML entities
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8230;/g, '…')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&[a-zA-Z]+;/g, ' ');
}

// Clean HTML titles
function cleanTitle(title) {
  if (!title) return '';
  title = decodeHtmlEntities(title).trim();
  const suffixes = [
    ' – ilmiyyah.com',
    ' - ilmiyyah.com',
    ' &#8211; ilmiyyah.com',
    ' &ndash; ilmiyyah.com'
  ];
  for (const suffix of suffixes) {
    const decodedSuffix = decodeHtmlEntities(suffix);
    if (title.endsWith(decodedSuffix)) {
      title = title.slice(0, -decodedSuffix.length).trim();
    }
  }
  return title;
}

// Fetch helper with retry logic and timeout
async function fetchTitle(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const htmlContent = await response.text();
        const match = htmlContent.match(/<title>([\s\S]*?)<\/title>/i);
        if (match) {
          return cleanTitle(match[1]);
        }
        return 'Untitled Page';
      }
      if (response.status === 404) {
        return 'Error: HTTP 404';
      }
    } catch (e) {
      if (i === retries - 1) {
        return `Error: ${e.message || 'Timeout/Fetch Failed'}`;
      }
    }
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return 'Error: Fetch Failed';
}

// Concurrent runner
async function runWithConcurrency(tasks, concurrencyLimit, taskFn) {
  let index = 0;
  const workers = Array.from({ length: concurrencyLimit }, async () => {
    while (index < tasks.length) {
      const myIndex = index++;
      const task = tasks[myIndex];
      try {
        await taskFn(task, myIndex);
      } catch (err) {
        console.error(`Error in task ${myIndex}:`, err);
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log("Bismillah. Starting titles scraper directly from ilmiyyah.com...");
  
  if (!fs.existsSync(csvInputPath)) {
    console.error(`Input file not found at: ${csvInputPath}`);
    return;
  }
  
  const csvContent = fs.readFileSync(csvInputPath, 'utf-8');
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    console.error("CSV is empty!");
    return;
  }
  
  // Read existing cache if any
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      console.log(`Loaded ${Object.keys(cache).length} titles from local cache.`);
    } catch (e) {
      console.warn("Failed to parse cache, starting fresh.");
    }
  }
  
  const rows = [];
  const uniqueUrls = new Set();
  
  // Parse rows (skipping header)
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length >= 4) {
      const folder = parts[0];
      const subfolder = parts[1];
      // Note: If previous CSV had 4 columns (Folder,Subfolder,Article,Status),
      // parts[2] is Article, parts[3] is Status.
      const article = parts[2];
      const status = parts[3];
      
      rows.push({ folder, subfolder, article, status });
      
      if (subfolder.startsWith('http')) {
        uniqueUrls.add(normalizeUrl(subfolder));
      }
      if (article.startsWith('http')) {
        uniqueUrls.add(normalizeUrl(article));
      }
    }
  }
  
  console.log(`Parsed ${rows.length} CSV rows.`);
  const urlList = Array.from(uniqueUrls).filter(url => !cache[url]);
  console.log(`Total unique URLs: ${uniqueUrls.size}. Already cached: ${uniqueUrls.size - urlList.length}. To fetch: ${urlList.length}`);
  
  // Concurrently fetch missing URLs
  let completed = 0;
  if (urlList.length > 0) {
    await runWithConcurrency(urlList, 15, async (url, idx) => {
      const title = await fetchTitle(url);
      cache[url] = title;
      completed++;
      
      console.log(`[${completed}/${urlList.length}] Fetched: ${url} -> ${title}`);
      
      // Save cache every 50 requests
      if (completed % 50 === 0) {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
        console.log(`--- Saved cache with ${Object.keys(cache).length} entries ---`);
      }
    });
    
    // Save final cache
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`--- Final cache saved with ${Object.keys(cache).length} entries ---`);
  }
  
  console.log("Constructing final CSV with updated titles...");
  
  // Header: Folder,Subfolder,Subfolder Title,Article,Article Title,Status
  const outputRows = ["Folder,Subfolder,Subfolder Title,Article,Article Title,Status"];
  
  for (const row of rows) {
    let subfolderTitle = '';
    if (row.subfolder.startsWith('http')) {
      subfolderTitle = cache[normalizeUrl(row.subfolder)] || 'Untitled Page';
    } else {
      subfolderTitle = row.subfolder; // Keep textual folder names as is
    }
    
    let articleTitle = '';
    if (row.article.startsWith('http')) {
      articleTitle = cache[normalizeUrl(row.article)] || 'Untitled Page';
    }
    
    outputRows.push(toCsvRow(
      row.folder,
      row.subfolder,
      subfolderTitle,
      row.article,
      articleTitle,
      row.status
    ));
  }
  
  console.log(`Writing output completed CSV with ${outputRows.length} lines to: ${csvOutputPath}`);
  fs.writeFileSync(csvOutputPath, outputRows.join('\n'), 'utf-8');
  console.log("Alhamdulillah, completed successfully!");
}

main().catch(err => {
  console.error("Error in main execution:", err);
});

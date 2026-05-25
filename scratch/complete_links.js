import fs from 'fs';
import path from 'path';

// Input and output files
const csvInputPath = '/home/abuhafi/Project/TesDeen/ilmiyyah.com links.csv';
const csvOutputPath = '/home/abuhafi/Project/TesDeen/ilmiyyah.com links completed.csv';

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
    
    // Remove clean params
    let search = '';
    if (parsed.search) {
      const params = new URLSearchParams(parsed.search);
      const cleanParams = new URLSearchParams();
      for (const [key, val] of params.entries()) {
        const k = key.toLowerCase();
        if (!['print', 'share', 'pdf', 'wp-playlist-format', 'replytocom', 'share_whatsapp', 'share_facebook', 'share_twitter', 'share_telegram'].includes(k)) {
          cleanParams.append(key, val);
        }
      }
      const searchStr = cleanParams.toString();
      if (searchStr) {
        search = '?' + searchStr;
      }
    }
    return `https://${hostname}${pathname}${search}`;
  } catch (e) {
    return url.replace(/\/$/, '');
  }
}

// Check if a URL should be excluded
function isExcluded(url, parentUrl) {
  const normUrl = normalizeUrl(url);
  const normParent = normalizeUrl(parentUrl);
  if (!normUrl.startsWith('https://ilmiyyah.com')) {
    return true;
  }
  if (normUrl === normParent) {
    return true;
  }
  
  const exclusions = [
    '/wp-admin/', '/wp-content/', '/wp-includes/', '/feed/', '/author/', '/tag/', 
    '/category/', '/comments/', '/replytocom=', '/tentang-kami', '/hubungi-kami', 
    '/donasi', '/syarat-ketentuan', '/kebijakan-privasi'
  ];
  if (exclusions.some(exc => normUrl.includes(exc))) {
    return true;
  }
  
  const extExclusions = ['.pdf', '.mp3', '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar', '.docx'];
  if (extExclusions.some(ext => normUrl.toLowerCase().endsWith(ext))) {
    return true;
  }
  
  return false;
}

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

// Format CSV fields properly (now has 4 columns: Folder,Subfolder,Article,Status)
function toCsvRow(folder, subfolder, article, status) {
  const escapeCsv = (str) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return `${escapeCsv(folder)},${escapeCsv(subfolder)},${escapeCsv(article)},${escapeCsv(status)}`;
}

// Fetch helper with retry logic and respect limit
async function fetchPage(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  let lastError = 'Unknown Error';
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url} (Attempt ${i + 1}/${retries})...`);
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        return { ok: true, text: await response.text() };
      }
      lastError = `HTTP ${response.status}`;
      console.warn(`HTTP error: ${response.status} for ${url}`);
      if (response.status === 404) {
        return { ok: false, error: 'HTTP 404' };
      }
    } catch (e) {
      lastError = e.message || 'Timeout/Network Error';
      console.warn(`Fetch error: ${lastError} for ${url}`);
    }
    // Wait before retrying
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return { ok: false, error: lastError };
}

// Main logic
async function main() {
  console.log("Bismillah. Starting completed CSV script with status reporting...");
  
  if (!fs.existsSync(csvInputPath)) {
    console.error(`Input file does not exist: ${csvInputPath}`);
    return;
  }
  
  const csvContent = fs.readFileSync(csvInputPath, 'utf-8');
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    console.error("CSV file is empty!");
    return;
  }
  
  // Header: Folder,Subfolder,Article,Status
  const outputRows = ["Folder,Subfolder,Article,Status"];
  
  // Parse rows (skip header)
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length >= 2) {
      rows.push({
        folder: parts[0],
        subfolder: parts[1],
        article: parts[2] || ''
      });
    }
  }
  
  console.log(`Found ${rows.length} data rows in CSV.`);
  
  // Let's count empty articles
  const emptyArticleRows = rows.filter(r => r.article === '');
  console.log(`Rows with empty article: ${emptyArticleRows.length}`);
  
  let processedCount = 0;
  
  for (const row of rows) {
    if (row.article !== '') {
      // Row has article already, copy exactly with "Already Mapped" status
      outputRows.push(toCsvRow(row.folder, row.subfolder, row.article, 'Already Mapped'));
      continue;
    }
    
    // Visit subfolder URL
    const url = row.subfolder;
    if (!url.startsWith('http')) {
      // If it's a name like "Adab Sosial Media", it is not a URL, so copy as is with status "Not a URL"
      outputRows.push(toCsvRow(row.folder, row.subfolder, '', 'Not a URL'));
      continue;
    }
    
    processedCount++;
    console.log(`\n[${processedCount}/${emptyArticleRows.length}] Processing empty article row: ${url}`);
    
    const fetchResult = await fetchPage(url);
    if (!fetchResult.ok) {
      console.error(`Failed to fetch page content for: ${url} - Reason: ${fetchResult.error}`);
      // Write row as is in case of failure with the specific error status
      outputRows.push(toCsvRow(row.folder, row.subfolder, '', `Error: ${fetchResult.error}`));
      continue;
    }
    
    const html = fetchResult.text;
    
    // Find entry-content robustly with regex matching variations of the class list
    const entryContentRegex = /class=["'][^"']*\bentry-content\b[^"']*["']/i;
    const matchClass = html.match(entryContentRegex);
    let contentHtml = '';
    
    if (matchClass) {
      const idx = html.indexOf(matchClass[0]);
      const articleCloseIdx = html.indexOf('</article>', idx);
      if (articleCloseIdx !== -1) {
        contentHtml = html.slice(idx, articleCloseIdx);
      } else {
        contentHtml = html.slice(idx);
      }
    } else {
      // Fallback to article tag
      const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
      if (articleMatch) {
        contentHtml = articleMatch[0];
      } else {
        contentHtml = html;
      }
    }
    
    // Extract links inside contentHtml
    const hrefRegex = /href=["']([^"']+)["']/gi;
    const grabbedLinks = [];
    const seen = new Set();
    
    let match;
    while ((match = hrefRegex.exec(contentHtml)) !== null) {
      const rawHref = match[1];
      const normalizedHref = normalizeUrl(rawHref);
      
      if (normalizedHref && !isExcluded(normalizedHref, url) && !seen.has(normalizedHref)) {
        seen.add(normalizedHref);
        grabbedLinks.push(normalizedHref);
      }
    }
    
    // Check if the page has audio elements (audio tag, wp-playlist, su-audio, or mp3 link references)
    const hasAudio = html.includes('<audio') || 
                     html.includes('wp-playlist') || 
                     html.includes('.mp3') || 
                     html.includes('su-audio') || 
                     html.includes('wp-playlist-script');
    
    const isParentAudioOnly = hasAudio && grabbedLinks.length === 0;
    
    if (isParentAudioOnly) {
      console.log(`-> Parent page is audio-only: ${url}`);
      outputRows.push(toCsvRow(row.folder, row.subfolder, '', 'Audio Only'));
      continue;
    }
    
    // Wait, are we under Ustad Firanda Andirja?
    // "skip the audio only"
    let filteredLinks = grabbedLinks;
    let audioSkippedCount = 0;
    
    if (row.folder.toLowerCase().includes('firanda') || row.folder.toLowerCase().includes('ufa')) {
      console.log(`Checking audio-only articles for Ustad Firanda Andirja...`);
      const nonAudioLinks = [];
      for (const link of grabbedLinks) {
        console.log(`Checking link for audio-only: ${link}`);
        // Let's scrape this link to check if it's audio-only
        await new Promise(resolve => setTimeout(resolve, 200));
        const subFetchResult = await fetchPage(link);
        if (subFetchResult.ok) {
          const subHtml = subFetchResult.text;
          let subContentHtml = '';
          const subMatch = subHtml.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][\s\S]*?<\/div>/i) || subHtml.match(/<article[\s\S]*?<\/article>/i);
          if (subMatch) {
            subContentHtml = subMatch[0];
          }
          
          // Count <p> tags with actual text length
          const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
          let pMatch;
          let textLength = 0;
          let hasAudio = subHtml.includes('<audio') || subHtml.includes('wp-playlist-script') || subHtml.includes('.mp3');
          
          while ((pMatch = pRegex.exec(subContentHtml)) !== null) {
            const cleanText = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (cleanText.toLowerCase().includes('silsilah:') || cleanText.toLowerCase().includes('audio:') || cleanText.toLowerCase().includes('transkrip:')) {
              continue;
            }
            textLength += cleanText.length;
          }
          
          console.log(`Article text length: ${textLength}, hasAudio: ${hasAudio}`);
          
          // If it has audio and text content is extremely short (e.g. less than 150 characters), it is audio-only
          if (hasAudio && textLength < 150) {
            console.log(`-> Skipping audio-only article: ${link}`);
            audioSkippedCount++;
          } else {
            nonAudioLinks.push(link);
          }
        } else {
          // If fetch fails, keep it just in case
          nonAudioLinks.push(link);
        }
      }
      filteredLinks = nonAudioLinks;
    }
    
    console.log(`Grabbed ${filteredLinks.length} valid links for ${url}:`);
    filteredLinks.forEach(l => console.log(`  - ${l}`));
    
    if (filteredLinks.length > 0) {
      // If there is one or more than one link, insert new line per link!
      for (const link of filteredLinks) {
        outputRows.push(toCsvRow(row.folder, row.subfolder, link, 'Success'));
      }
    } else {
      // If no valid links are found:
      let statusStr = 'Leaf Article (No Child Links)';
      if (audioSkippedCount > 0) {
        statusStr = 'Skipped: Audio Only';
      }
      outputRows.push(toCsvRow(row.folder, row.subfolder, '', statusStr));
    }
    
    // Respect limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Write output CSV
  console.log(`Writing output completed CSV with ${outputRows.length} lines to: ${csvOutputPath}`);
  fs.writeFileSync(csvOutputPath, outputRows.join('\n'), 'utf-8');
  console.log("Alhamdulillah, completed successfully!");
}

main().catch(err => {
  console.error("Error in main execution:", err);
});

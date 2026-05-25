import fs from 'fs';
import path from 'path';

// Let's define the paths to our scraped steps files
const stepsDir = '/home/abuhafi/.gemini/antigravity-ide/brain/3b0e10b6-8c3a-427e-aaf8-f05d2b3636ac/.system_generated/steps';

function cleanUrl(url) {
  if (!url) return '';
  return url.trim().replace(/\/$/, '');
}

// 1. Parse Homepage (680)
const homepageContent = fs.readFileSync(path.join(stepsDir, '680/content.md'), 'utf-8');
// Extract links from <table id="myTable">...</table>
// In markdown/html, we can use regex to extract the table content and then each row's link
const tableRegex = /<table id="myTable">([\s\S]*?)<\/table>/i;
const hrefRegex = /href="([^"]+)"/g;

function getTableLinks(content) {
  const tableMatch = content.match(tableRegex);
  if (!tableMatch) return [];
  const tableHtml = tableMatch[1];
  const links = [];
  let match;
  const localHrefRegex = /href="([^"]+)"/g;
  while ((match = localHrefRegex.exec(tableHtml)) !== null) {
    links.push(cleanUrl(match[1]));
  }
  return links;
}

const kutubLinks = getTableLinks(homepageContent);
console.log(`Kutub links found: ${kutubLinks.length}`);

// 2. Parse Halaqah Silsilah Ilmiyah (688)
const halaqahContent = fs.readFileSync(path.join(stepsDir, '688/content.md'), 'utf-8');
const halaqahLinks = getTableLinks(halaqahContent);
console.log(`Halaqah Silsilah Ilmiyah links found: ${halaqahLinks.length}`);

// 3. Parse Bimbingan Islam (696)
const bimbinganContent = fs.readFileSync(path.join(stepsDir, '696/content.md'), 'utf-8');
// Accordions: <div class="su-spoiler ..."><div class="su-spoiler-title">...</div><div class="su-spoiler-content">...</div></div>
const accordionFolders = []; // array of { title: string, links: string[] }
const spoilerRegex = /<div class="su-spoiler[^"]*"[^>]*>([\s\S]*?)<\/div><\/div>/g;
const titleRegex = /<div class="su-spoiler-title"[^>]*>([\s\S]*?)<\/div>/i;
const contentRegex = /<div class="su-spoiler-content[^"]*"[^>]*>([\s\S]*)$/i; // inside spoiler block

let spoilerMatch;
const rawSpoilers = bimbinganContent.match(/<div class="su-spoiler[\s\S]*?<\/div>\s*<\/div>/g) || [];
for (const spoilerHtml of rawSpoilers) {
  const titleM = spoilerHtml.match(/<div class="su-spoiler-title"[^>]*>([\s\S]*?)<\/div>/i);
  if (titleM) {
    let titleText = titleM[1].replace(/<[^>]+>/g, '').trim();
    // Extract links from this spoiler
    const links = [];
    let match;
    const localHrefRegex = /href="([^"]+)"/g;
    while ((match = localHrefRegex.exec(spoilerHtml)) !== null) {
      // Don't add if it's the title itself or empty
      const url = cleanUrl(match[1]);
      if (url && !url.includes('javascript:')) {
        links.push(url);
      }
    }
    accordionFolders.push({ title: titleText, links });
  }
}

// Flat links in article part of Bimbingan Islam (excluding the accordion links)
// Let's find links inside entry-content that are NOT inside the su-accordion class
const entryContentRegex = /<div class="entry-content clear"[\s\S]*?<\/div>\s*<\/div>/i;
// Let's find all hrefs in the bimbingan content that are in <li> elements or direct lists
const bimbinganFlatLinks = [];
const entryContentMatch = bimbinganContent.match(/<div class="entry-content clear"[\s\S]*?<\/div><!-- \.entry-content/i);
if (entryContentMatch) {
  const innerHtml = entryContentMatch[0];
  // Remove the accordion parts so we only get flat links
  const accordionFreeHtml = innerHtml.replace(/<div class="su-accordion[\s\S]*?<\/div>\s*<\/div>/g, '');
  let match;
  const localHrefRegex = /href="([^"]+)"/g;
  while ((match = localHrefRegex.exec(accordionFreeHtml)) !== null) {
    const url = cleanUrl(match[1]);
    if (url && !url.includes('ilmiyyah.com/bimbingan-islam') && !url.includes('wp-content') && !url.includes('?') && !url.includes('javascript:') && !url.includes('forms.gle')) {
      bimbinganFlatLinks.push(url);
    }
  }
}
console.log(`Bimbingan Islam flat links:`, bimbinganFlatLinks);
console.log(`Bimbingan Islam accordion folders count: ${accordionFolders.length}`);

// 4. Parse Kelas UFA (704)
const ufaContent = fs.readFileSync(path.join(stepsDir, '704/content.md'), 'utf-8');
const ufaLinks = [];
const ufaContentMatch = ufaContent.match(/<div class="entry-content clear"[\s\S]*?<\/div><!-- \.entry-content/i);
if (ufaContentMatch) {
  const innerHtml = ufaContentMatch[0];
  let match;
  const localHrefRegex = /href="([^"]+)"/g;
  while ((match = localHrefRegex.exec(innerHtml)) !== null) {
    const url = cleanUrl(match[1]);
    if (url && !url.includes('forms.gle') && !url.includes('print=') && !url.includes('ilmiyyah.com/kelas-ufa') && !url.includes('#')) {
      ufaLinks.push(url);
    }
  }
}
console.log(`Kelas UFA links:`, ufaLinks);

// 5. Parse Dirosah Islamiyah (714)
const dirosahContent = fs.readFileSync(path.join(stepsDir, '714/content.md'), 'utf-8');
const dirosahLinks = getTableLinks(dirosahContent);
console.log(`Dirosah Islamiyah links:`, dirosahLinks);

// 6. Parse Grup Islam Sunnah (761)
const gisContent = fs.readFileSync(path.join(stepsDir, '761/content.md'), 'utf-8');
const gisLinks = [];
const gisContentMatch = gisContent.match(/<div class="entry-content clear"[\s\S]*?<\/div><!-- \.entry-content/i);
if (gisContentMatch) {
  const innerHtml = gisContentMatch[0];
  let match;
  const localHrefRegex = /href="([^"]+)"/g;
  while ((match = localHrefRegex.exec(innerHtml)) !== null) {
    const url = cleanUrl(match[1]);
    if (url && !url.includes('grup-islam-sunnah-gis') && !url.includes('wp-content') && !url.includes('print=')) {
      gisLinks.push(url);
    }
  }
}
console.log(`Group Islam Sunnah links:`, gisLinks);

import fs from 'fs';
import path from 'path';

const stepsDir = '/home/abuhafi/.gemini/antigravity-ide/brain/3b0e10b6-8c3a-427e-aaf8-f05d2b3636ac/.system_generated/steps';

function cleanUrl(url) {
  if (!url) return '';
  return url.trim().replace(/\/$/, '');
}

// Extract table links
function getTableLinks(content) {
  const tableRegex = /<table id="myTable">([\s\S]*?)<\/table>/i;
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

// 1. Homepage (Kutub)
const homepageContent = fs.readFileSync(path.join(stepsDir, '680/content.md'), 'utf-8');
const kutubLinks = getTableLinks(homepageContent);

// 2. Halaqah Silsilah Ilmiyah
const halaqahContent = fs.readFileSync(path.join(stepsDir, '688/content.md'), 'utf-8');
const halaqahLinks = getTableLinks(halaqahContent);

// 3. Bimbingan Islam
const bimbinganContent = fs.readFileSync(path.join(stepsDir, '696/content.md'), 'utf-8');
const bimbinganFlatLinks = [
  "https://ilmiyyah.com/bimbingan-islam/kitab-syarah-ushul-iman",
  "https://ilmiyyah.com/bimbingan-islam/keutamaan-10-hari-pertama-bulan-dzulhijjah-dan-hari-tasyrik-serta-beberapa-panduan-praktis-berkurban",
  "https://ilmiyyah.com/bimbingan-islam/silsilah-ringkas-fiqih-thaharoh",
  "https://ilmiyyah.com/bimbingan-islam/tuhanmu-adalah-tuhan-yang-esa",
  "https://ilmiyyah.com/bimbingan-islam/tematik/faedah-surat-al-kahfi"
];

// Spoilers for Bimbingan Islam
const bimbinganSpoilers = [];
const rawSpoilers = bimbinganContent.match(/<div class="su-spoiler[\s\S]*?<\/div>\s*<\/div>/g) || [];
for (const spoilerHtml of rawSpoilers) {
  const titleM = spoilerHtml.match(/<div class="su-spoiler-title"[^>]*>([\s\S]*?)<\/div>/i);
  if (titleM) {
    let titleText = titleM[1].replace(/<[^>]+>/g, '').trim();
    const links = [];
    let match;
    const localHrefRegex = /href="([^"]+)"/g;
    while ((match = localHrefRegex.exec(spoilerHtml)) !== null) {
      const url = cleanUrl(match[1]);
      if (url && !url.includes('javascript:') && !links.includes(url)) {
        links.push(url);
      }
    }
    bimbinganSpoilers.push({ title: titleText, links });
  }
}

// 4. Kelas UFA
const ufaContent = fs.readFileSync(path.join(stepsDir, '704/content.md'), 'utf-8');
const ufaLinks = [
  "https://ilmiyyah.com/kelas-ufa/silsilah-amalan-hati-dan-penyakit-hati",
  "https://ilmiyyah.com/archives/5532",
  "https://ilmiyyah.com/archives/6832"
];

// 5. Dirosah Islamiyah
const dirosahContent = fs.readFileSync(path.join(stepsDir, '714/content.md'), 'utf-8');
const dirosahLinks = getTableLinks(dirosahContent);

// 6. Group Islam Sunnah
const gisLinks = [
  "https://ilmiyyah.com/archives/10311"
];

const result = {
  kutub: kutubLinks,
  halaqah: halaqahLinks,
  bimbinganFlat: bimbinganFlatLinks,
  bimbinganSpoilers: bimbinganSpoilers,
  ufa: ufaLinks,
  dirosah: dirosahLinks,
  gis: gisLinks
};

console.log(JSON.stringify(result, null, 2));

/**
 * ══════════════════════════════════════════════════════════════
 *  CalScape Plant Database Scraper
 *  Populates the "Plants" Google Sheet with data from calscape.org
 * ══════════════════════════════════════════════════════════════
 *
 *  QUICK START
 *  ───────────
 *  1. Paste this entire script into your Plants spreadsheet's
 *     Apps Script editor (Extensions > Apps Script).
 *
 *  2. Run  collectAllPlantURLs()  — grabs every plant URL from
 *     CalScape's search pages into a helper sheet "PlantURLs".
 *     If it times out, run it again; it resumes where it left off.
 *
 *  3. Run  startProcessingPlants()  — sets up a time-driven trigger
 *     that processes ~25 plants every 2 minutes automatically.
 *     Let it run overnight. ~8,500 plants ≈ 11–12 hours.
 *
 *  4. Run  getStatus()  any time to see progress.
 *
 *  5. Run  stopProcessing()  to cancel if needed.
 *
 *  COLUMNS WRITTEN (matches your sheet header row exactly)
 *  ─────────────────────────────────────────────────────────
 *  A  Common Name          L  Color
 *  B  Botanical Name       M  Flowering season
 *  C  Plant description    N  Special uses
 *  D  Plant overview       O  Sun
 *  E  Plant type           P  Water
 *  F  Size                 Q  Cold tolerance
 *  G  Form                 R  Soil drainage
 *  H  Growth rate          S  Soil description
 *  I  Dormancy             T  Wildlife supported
 *  J  Fragrance            U  Alternative names
 *  K  Pleasant
 */

// ──────────────────────────────────────────────
//  CONFIGURATION  (edit if needed)
// ──────────────────────────────────────────────
const CFG = {
  SPREADSHEET_ID  : '1FFhvdCupYlTJnPQIyGwWDRmHtuhqKFi2whK9BgjSdHk',
  PLANTS_SHEET    : 'Plants',       // name of your data sheet
  URLS_SHEET      : 'PlantURLs',    // helper sheet (auto-created)
  BATCH_SIZE      : 25,             // plants per trigger run
  TRIGGER_MINS    : 5,              // run every N minutes
  DELAY_MS        : 400,            // polite delay between fetches
  SEARCH_BASE: 'https://calscape.org/search?plant=&orderBy=&location_name=&lat=&lng=&perPage=60',
  SITE_BASE       : 'https://calscape.org',
};


// ══════════════════════════════════════════════════════════════
//  PHASE 1 — COLLECT ALL PLANT URLs
// ══════════════════════════════════════════════════════════════

/**
 * Paginates through CalScape search results and collects every
 * plant page URL into the "PlantURLs" helper sheet.
 * Run multiple times if it times out — it resumes automatically.
 */
function collectAllPlantURLs() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const props = PropertiesService.getScriptProperties();

  // Create / initialise the URL tracker sheet
  let urlSheet = ss.getSheetByName(CFG.URLS_SHEET);
  if (!urlSheet) {
    urlSheet = ss.insertSheet(CFG.URLS_SHEET);
    urlSheet.appendRow(['URL', 'Common Name', 'Botanical Name', 'Status']);
    urlSheet.setFrozenRows(1);
  }

  let page  = parseInt(props.getProperty('collect_page')  || '1');
  let total = parseInt(props.getProperty('collect_total') || '0');
  const startTime = Date.now();
  const MAX_MS    = 5.5 * 60 * 1000;  // stay under 6-min limit

  Logger.log(`Starting URL collection at page ${page} (${total} collected so far)`);

  while (Date.now() - startTime < MAX_MS) {
    const pageUrl = `${CFG.SEARCH_BASE}&page=${page}`;
    let html;

    try {
      const resp = UrlFetchApp.fetch(pageUrl, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) {
        Logger.log(`Non-200 on page ${page} — stopping collection`);
        props.setProperty('collect_done', 'true');
        break;
      }
      html = resp.getContentText();
    } catch (e) {
      Logger.log(`Fetch error on page ${page}: ${e}`);
      break;
    }

    const links = _extractLinksFromSearchPage(html);

    // No links → we've passed the last page
    if (links.length === 0) {
      Logger.log(`No links found on page ${page} — collection complete`);
      props.setProperty('collect_done', 'true');
      break;
    }

    // Append rows to the URL sheet
    const rows = links.map(p => [p.url, p.commonName, p.botanicalName, 'pending']);
    urlSheet.getRange(urlSheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);

    total += links.length;
    Logger.log(`Page ${page}: +${links.length} links (running total: ${total})`);

    page++;
    props.setProperty('collect_page',  String(page));
    props.setProperty('collect_total', String(total));

    Utilities.sleep(CFG.DELAY_MS);
  }

  const done = props.getProperty('collect_done') === 'true';
  const msg  = done
    ? `✅ Collection COMPLETE — ${total} plant URLs gathered.\n\nNow run startProcessingPlants().`
    : `⏳ Timed out at page ${page} (${total} URLs so far).\nRun collectAllPlantURLs() again to continue.`;

  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

/** Extract plant page links from a CalScape search results page. */
function _extractLinksFromSearchPage(html) {
  const links = [];
  const seen  = new Set();

  // Plant page hrefs: /Capital-Letter-Botanical-Name-(Common-Name)
  // e.g. /Salvia-sonomensis-'Mrs.-Beard'-(Mrs.-Beard-Creeping-Sage)
  const re = /href="(\/[A-Z][^"?#]*\([^)"]+\))"/g;
  let m;

  while ((m = re.exec(html)) !== null) {
    const path = m[1];

    // Skip utility pages
    if (path.includes('/plantlabel/') || path.includes('/plantsign/') ||
        path.includes('/nurseries/')  || path.includes('/search'))    continue;
    if (seen.has(path)) continue;
    seen.add(path);

    // Common name = text inside trailing parentheses
    const cMatch = path.match(/\(([^)]+)\)\s*$/);
    const commonName = cMatch ? cMatch[1].replace(/-/g, ' ').trim() : '';

    // Botanical name = path segment before the parenthesis
    const bMatch = path.match(/^\/(.+?)\s*\(/);
    const botanicalName = bMatch
      ? bMatch[1].replace(/-/g, ' ').replace(/'/g, "'").trim()
      : '';

    links.push({ url: CFG.SITE_BASE + path, commonName, botanicalName });
    
  }

  return links;
}


// ══════════════════════════════════════════════════════════════
//  PHASE 2 — PROCESS PLANTS (fetch + parse + write)
// ══════════════════════════════════════════════════════════════

/** Sets up a repeating trigger to process plants in the background. */
function startProcessingPlants() {
  stopProcessing(); // clear any previous trigger first

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('process_row')) {
    props.setProperty('process_row', '2'); // row 1 = header
  }

  ScriptApp.newTrigger('processBatch')
    .timeBased()
    .everyMinutes(CFG.TRIGGER_MINS)
    .create();

  Logger.log('✅ Processing trigger created.');
  SpreadsheetApp.getUi().alert(
    `✅ Processing started!\n\n` +
    `Plants will be scraped every ${CFG.TRIGGER_MINS} minutes automatically.\n` +
    `Check the Plants sheet for rows filling in.\n\n` +
    `Run getStatus() to check progress.\n` +
    `Run stopProcessing() to cancel.`
  );
}

/** Deletes the processing trigger. */
function stopProcessing() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processBatch')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Processing trigger stopped.');
}


/**
 * Set of plant page URLs already in the Plants sheet (column Y – where
 * _writePlant puts pageUrl). Used so re-runs NEVER append a plant twice.
 */
function _existingPlantUrls(sheet) {
  const set = new Set();
  const last = sheet.getLastRow();
  if (last < 2) return set;
  sheet.getRange(2, 25, last - 1, 1).getValues()
    .forEach(function (r) { if (r[0]) set.add(String(r[0]).trim()); });
  return set;
}

/** Called by the time trigger — processes one batch of plants. */
function processBatch() {
  const ss         = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const urlSheet   = ss.getSheetByName(CFG.URLS_SHEET);
  const plantsSheet = ss.getSheetByName(CFG.PLANTS_SHEET);

  if (!urlSheet) {
    Logger.log('PlantURLs sheet not found — run collectAllPlantURLs() first.');
    stopProcessing();
    return;
  }

  const props   = PropertiesService.getScriptProperties();
  let   rowIdx  = parseInt(props.getProperty('process_row') || '2');
  const urlData = urlSheet.getDataRange().getValues();
  const total   = urlData.length;

  if (rowIdx >= total) {
    Logger.log('🎉 All plants processed!');
    stopProcessing();
    return;
  }

  const startTime = Date.now();
  const MAX_MS    = 5.5 * 60 * 1000;
  let   count     = 0;
  const existing  = _existingPlantUrls(plantsSheet);

  while (rowIdx < total && count < CFG.BATCH_SIZE && Date.now() - startTime < MAX_MS) {
    const row    = urlData[rowIdx];
    const url    = row[0];
    const status = row[3];

    // Skip already-processed or blank rows
    if (!url || !String(url).startsWith('http') || status === 'done') {
      rowIdx++;
      continue;
    }

    // Already in the Plants sheet? Mark done and skip (no fetch, no duplicate row)
    if (existing.has(String(url).trim())) {
      urlSheet.getRange(rowIdx + 1, 4).setValue('done');
      rowIdx++;
      continue;
    }

    try {
      const plant = _fetchAndParse(url);
      if (plant) {
        _writePlant(plantsSheet, plant);
        existing.add(String(url).trim());
        urlSheet.getRange(rowIdx + 1, 4).setValue('done');
      } else {
        urlSheet.getRange(rowIdx + 1, 4).setValue('parse-error');
      }
    } catch (e) {
      Logger.log(`Error on ${url}: ${e}`);
      urlSheet.getRange(rowIdx + 1, 4).setValue(`error: ${e.message.substring(0, 50)}`);
    }

    rowIdx++;
    count++;
    if (count < CFG.BATCH_SIZE) Utilities.sleep(CFG.DELAY_MS);
  }

  props.setProperty('process_row', String(rowIdx));
  Logger.log(`Batch done: processed ${count} plants. Next row: ${rowIdx} / ${total}`);
}


// ══════════════════════════════════════════════════════════════
//  HTML FETCH + PARSER
// ══════════════════════════════════════════════════════════════

function _fetchAndParse(url) {
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  return _parsePage(resp.getContentText(), url);
}

/**
 * REPLACEMENT for the _parsePage() function in CalScapeScraper.gs
 *
 * Fixes:
 *  - commonName / botanicalName pulled from <title> and <meta> as fallbacks
 *  - nav/footer text stripped before parsing (fixes Water, and other fields
 *    that could bleed in from menu links like "Adapt to climate change")
 *  - Size captures both Tall and Wide lines
 */
/**
 * REPLACEMENT for the _parsePage() function in CalScapeScraper.gs
 *
 * Fixes:
 *  - commonName / botanicalName pulled from <title> and <meta> as fallbacks
 *  - nav/footer text stripped before parsing (fixes Water, and other fields
 *    that could bleed in from menu links like "Adapt to climate change")
 *  - Size captures both Tall and Wide lines
 */
function _parsePage(html, url) {

  // ── 1. Common Name ────────────────────────────────────────────
  // Try H1 first, fall back to og:title / <title>
  let commonName = '';
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1m) {
    commonName = h1m[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!commonName) {
    const ogm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
             || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    commonName = ogm ? ogm[1].trim() : '';
  }
  if (!commonName) {
    const titlem = html.match(/<title>([^<]+)<\/title>/i);
    if (titlem) commonName = titlem[1].replace(/\s*[|–-].*$/, '').trim();
  }

  // ── 2. Botanical Name ─────────────────────────────────────────
  // Look for the first italic/em block that looks like "Genus species..."
  // Restrict to the top portion of the page (first 3000 chars) to avoid
  // hitting italics in citations at the bottom.
let botanicalName = '';
  const topHtml = html.substring(0, 4000);
  const emAll = [...topHtml.matchAll(/<(?:em|i)[^>]*>([A-Z][a-z]+(?:\s+[\w.'×\s-]+)+)<\/(?:em|i)>/g)];
  if (emAll.length) {
    botanicalName = emAll[0][1].trim();
  }
  if (!botanicalName) {
    const urlMatch = url.match(/calscape\.org\/([^(]+)\(/);
    if (urlMatch) botanicalName = urlMatch[1].replace(/-/g, ' ').replace(/'/g, "'").trim();
  }
  // Fallback: meta description sometimes starts with the botanical name
  if (!botanicalName) {
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{5,80})["']/i);
    if (metaDesc) {
      const bm = metaDesc[1].match(/^([A-Z][a-z]+ [a-z][a-z-]+)/);
      if (bm) botanicalName = bm[1];
    }
  }

  // ── 3. Build a CLEAN TEXT block from just the plant data ─────
  // Strip everything before "Plant description" and after "Sources" /
  // footer text. This prevents nav-menu links (like "Adapt to climate
  // change", "Save water", "Watering native plants") from polluting fields.

  // First pass: full HTML → text
  const fullText = html
    .replace(/<br\s*\/?>/gi,  '\n')
    .replace(/<\/(?:p|li|div|h[1-6]|section|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g,      '')
    .replace(/&amp;/g,        '&')
    .replace(/&lt;/g,         '<')
    .replace(/&gt;/g,         '>')
    .replace(/&nbsp;/g,       ' ')
    .replace(/&#39;/g,        "'")
    .replace(/&quot;/g,       '"')
    .replace(/[ \t]+/g,       ' ')
    .replace(/\n[ \t]+/g,     '\n')
    .replace(/\n{3,}/g,       '\n\n');

  // Second pass: trim to just the plant-data section
  const dataStart = fullText.search(/Plant description/i);
  const dataEnd   = fullText.search(/(?:Visit\s+About\s+Us|©\s*California Native|Additional references)/i);

  const text = dataStart >= 0
    ? fullText.substring(dataStart, dataEnd > dataStart ? dataEnd : undefined).trim()
    : fullText;

  // ── Helpers that operate on the clean data section ───────────

  /** First non-blank line after a label (case-sensitive label). */
  function after(label) {
    // Use exact-case match on the label to avoid nav-menu collisions
    const re = new RegExp('\\b' + _esc(label) + '\\s*\\n+\\s*([^\\n]+)', '');
    const m  = text.match(re);
    return m ? m[1].trim() : '';
  }

  /**
   * All non-blank lines between a label and the next stop-word.
   * Joined with ', ' — handles multi-line values like Size.
   */
  function block(label, stopPattern) {
    const re = new RegExp(
      '\\b' + _esc(label) + '\\s*\\n+([\\s\\S]*?)(?=\\n\\s*(?:' + stopPattern + ')\\b|\\n\\n)',
      ''   // NOT case-insensitive — prevents nav bleed
    );
    const m = text.match(re);
    if (!m) return '';
    return m[1]
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join(', ');
  }

  // ── Plant description ─────────────────────────────────────────
  const descM = text.match(/Plant description\s*\n+([\s\S]*?)(?=\n\s*Plant overview|\n\n)/i);
  const description = descM ? descM[1].replace(/\n/g, ' ').trim() : '';

  // ── Overview fields ───────────────────────────────────────────
  const plantType       = after('Plant type');
  const size            = block('Size',             'Form|Growth rate');
  const form            = after('Form');
  const growthRate      = after('Growth rate');
  const dormancy        = block('Dormancy',         'Fragrance|Color|Flowering');
  const fragrance       = after('Fragrance');
  const color           = block('Color',            'Flowering season|Special uses');
  const floweringSeason = block('Flowering season', 'Special uses|Sun|Water|Landscaping');
  const specialUses     = block('Special uses',     'Sun|Water|Landscaping|Cold|Soil');

  // ── Landscaping fields ────────────────────────────────────────
  const sun           = block('Sun',            'Water|Cold');
  const water         = after('Water');          // exact-case "Water" won't hit nav
  const coldTolerance = after('Cold tolerance');
  const soilDrainage  = after('Soil drainage');
  const soilDesc      = block('Soil description', 'Wildlife|Alternative');

  // ── Wildlife supported ────────────────────────────────────────
  const wildM = text.match(/Wildlife supported\s*\n+([\s\S]*?)(?=Alternative names|\n\nSources)/i);
  let wildlifeSupported = '';
  if (wildM) {
    wildlifeSupported = wildM[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2 && l.length < 40)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ');
  }
// ── Maintenance ───────────────────────────────────────────────
  const maintM = html.match(/<strong>Maintenance<\/strong>\s*<p>([\s\S]*?)<\/p>/i);
  const maintenance = maintM ? maintM[1].replace(/<[^>]+>/g, '').trim() : '';
  // ── Alternative names ─────────────────────────────────────────
  const altM = text.match(/Alternative names[\s\S]*?Common names?:?\s*\n([\s\S]*?)(?=\n\nSources|\n\nVisit|$)/i);
  const alternativeNames = altM
    ? altM[1].split('\n').map(l => l.trim()).filter(Boolean).join(', ')
    : '';

 
                 // ── Images ───────────────────────────────────────────────────
  // Grab all <img> src values that look like plant photos
 // Catch both src and data-src (lazy-loaded gallery images)
const imgRe = /<img[^>]+(?:src|data-src)=["']([^"']*(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  const allImgs = [];
  let imgM;
  while ((imgM = imgRe.exec(html)) !== null) {
    const src = imgM[1].startsWith('http') ? imgM[1].trim() : CFG.SITE_BASE + imgM[1].trim();
    // Skip logos, icons, and non-plant images
    if (src.includes('Logo') || src.includes('logo') || src.includes('icon') || src.includes('cnps.org')) continue;
    if (!allImgs.includes(src)) allImgs.push(src);
  }
  const mainImage = allImgs[0] || '';
  const img2 = allImgs[1] || '';
  const img3 = allImgs[2] || '';
  const img4 = allImgs[3] || '';
  const img5 = allImgs[4] || '';
  const img6 = allImgs[5] || '';
  const img7 = allImgs[6] || '';

  return {
    commonName,
    botanicalName,
    description,
    overview        : '',
    plantType,
    size,
    form,
    growthRate,
    dormancy,
    fragrance,
    maintenance,
    color,
    floweringSeason,
    specialUses,
    sun,
    water,
    coldTolerance,
    soilDrainage,
    soilDescription : soilDesc,
    wildlifeSupported,
    alternativeNames,mainImage,
    pageUrl         : url,
  };
}



/** Write one plant data object to the next row of the Plants sheet. */
function _writePlant(sheet, d) {
  const row = [
    d.commonName,        // A
    d.botanicalName,     // B
    d.description,       // C
    d.overview,          // D
    d.plantType,         // E
    d.size,              // F
    d.form,              // G
    d.growthRate,        // H
    d.dormancy,          // I
    d.fragrance,         // J
    d.maintenance,          // K
    d.color,             // L
    d.floweringSeason,   // M
    d.specialUses,       // N
    d.sun,               // O
    d.water,             // P
    d.coldTolerance,     // Q
    d.soilDrainage,      // R
    d.soilDescription,   // S
    d.wildlifeSupported, // T
    d.alternativeNames,  // U
    d.alternativeNames,  // U
    d.mainImage,                                          // V  (raw URL)
    d.mainImage ? `=IMAGE("${d.mainImage}")` : '',        // W  (rendered image)
    d.pageUrl,                                            // X
   
  ];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

/** Escape regex special chars in a label string. */
function _esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════

/** Show current progress. Run any time. */
function getStatus() {
  const ss       = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const urlSheet = ss.getSheetByName(CFG.URLS_SHEET);
  const plantsSheet = ss.getSheetByName(CFG.PLANTS_SHEET);
  const props    = PropertiesService.getScriptProperties();

  const totalURLs   = urlSheet ? Math.max(0, urlSheet.getLastRow() - 1) : 0;
  const processRow  = parseInt(props.getProperty('process_row') || '2');
  const plantsAdded = plantsSheet ? Math.max(0, plantsSheet.getLastRow() - 1) : 0;
  const collectDone = props.getProperty('collect_done') === 'true';
  const pct         = totalURLs > 0 ? Math.round((processRow - 2) / totalURLs * 100) : 0;

  const active = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'processBatch');

  const msg = [
    '══ CalScape Scraper Status ══',
    `URLs collected : ${totalURLs}  (collection ${collectDone ? '✅ done' : '⏳ in progress'})`,
    `Plants added   : ${plantsAdded}`,
    `Progress       : row ${processRow} / ${totalURLs + 1}  (${pct}%)`,
    `Trigger active : ${active ? '✅ yes' : '❌ no'}`,
  ].join('\n');

  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * TEST: Scrape a single plant URL and log the result.
 * Paste any calscape.org plant URL to verify parsing.
 */
function testSinglePlant() {
  const url    = "https://calscape.org/Salvia-sonomensis-'Mrs.-Beard'-(Mrs.-Beard-Creeping-Sage)";
  const plant  = _fetchAndParse(url);
  Logger.log(JSON.stringify(plant, null, 2));
  SpreadsheetApp.getUi().alert('Result logged — check View > Logs');
}

/** Reset all stored progress (use before starting over). */
function resetProgress() {
  const props = PropertiesService.getScriptProperties();
  ['collect_page','collect_total','collect_done','process_row']
    .forEach(k => props.deleteProperty(k));
  Logger.log('Progress reset.');
  SpreadsheetApp.getUi().alert('Progress reset. You can now re-run collection from the beginning.');
}
function dedupePlantURLs() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CFG.URLS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  const header = data[0];
  const seen = new Set();
  const unique = [header];
  
  for (var i = 1; i < data.length; i++) {
    const url = data[i][0];
    if (url && !seen.has(url)) {
      seen.add(url);
      unique.push(data[i]);
    }
  }
  
  sheet.clearContents();
  sheet.getRange(1, 1, unique.length, unique[0].length).setValues(unique);
  
  const removed = data.length - unique.length;
  SpreadsheetApp.getUi().alert(
    'Dedup complete!\nBefore: ' + (data.length - 1) + ' rows\n' +
    'After: ' + (unique.length - 1) + ' rows\n' +
    'Duplicates removed: ' + removed
  );
}
function startCollecting() {
  // Remove any existing collection trigger
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'collectAllPlantURLs'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('collectAllPlantURLs')
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert('Collection trigger started — runs every 6 minutes automatically until done.');
}
function testSearchPage() {
  const url = 'https://calscape.org/search?plant=&orderBy=&location_name=&lat=&lng=&perPage=60&page=1';
  const html = UrlFetchApp.fetch(url, {muteHttpExceptions: true}).getContentText();
  
  // Log first 3000 chars so we can see what we're actually getting
  Logger.log('STATUS: ' + UrlFetchApp.fetch(url, {muteHttpExceptions: true}).getResponseCode());
  Logger.log('FIRST 3000 CHARS:\n' + html.substring(0, 3000));
  
  // Also test if our regex finds anything
  const links = _extractLinksFromSearchPage(html);
  Logger.log('LINKS FOUND: ' + links.length);
  if (links.length > 0) Logger.log('FIRST LINK: ' + JSON.stringify(links[0]));
}
function testSitemap() {
 const resp = UrlFetchApp.fetch(pageUrl, {
  muteHttpExceptions: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' }
});
  Logger.log('Status: ' + resp.getResponseCode());
  Logger.log(resp.getContentText().substring(0, 2000));
}
function debugImages() {
  const url = "https://calscape.org/Salvia-sonomensis-'Mrs.-Beard'-(Mrs.-Beard-Creeping-Sage)";
  const html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  
  // Look for any JSON or JS variable containing image URLs
  const jsonImgs = html.match(/["'](\/storage\/app\/uploads\/[^"']+(?:jpg|jpeg|png|webp))['"]/g);
  Logger.log('Storage paths found: ' + (jsonImgs ? jsonImgs.length : 0));
  if (jsonImgs) Logger.log(jsonImgs.slice(0, 10).join('\n'));
}
function debugImages2() {
  const url = "https://calscape.org/Salvia-sonomensis-'Mrs.-Beard'-(Mrs.-Beard-Creeping-Sage)";
  const html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  
  // Find where "photo" or "image" or "gallery" appears and log surrounding context
  const idx = html.toLowerCase().indexOf('photo');
  Logger.log('Around "photo": \n' + html.substring(idx - 100, idx + 500));
  
  // Also log any URLs containing "uploads"
  const uploads = html.match(/[^"']*uploads[^"']*/g);
  Logger.log('Upload refs: ' + JSON.stringify(uploads ? uploads.slice(0, 5) : []));
}
function debugMaintenance() {
  const url = "https://calscape.org/Salvia-apiana-(White-Sage)";
  const html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  
  const idx = html.toLowerCase().indexOf('maintenance');
  if (idx === -1) {
    Logger.log('Maintenance not found in HTML');
  } else {
    Logger.log('Around "maintenance":\n' + html.substring(idx - 100, idx + 300));
  }
}
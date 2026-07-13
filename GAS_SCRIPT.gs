// ── SHEET IDs ────────────────────────────────────────────────────────────────
const SITES_ID  = '1fs9T_fhevN-6_NgaDV941-RaQMC5mF52yc8eDitgsJc';
const HUMANS_ID = '19s6gQeFJWeVcAezkE1Lg6MJcZ3C8-h-IdWmZUDT5cHk';
const CHORES_ID = '13PV1ahdjdelyT3iaZRmpunqKmIb8NjsNOs6Hw_Jw1Yo';
const PLANTS_ID = '1FFhvdCupYlTJnPQIyGwWDRmHtuhqKFi2whK9BgjSdHk';
const MEMOS_ID  = '13Sx_kJejX0gJ3FtnlCtnizr9Bjcna-ekvKe9q0U85ug';

// ── DRIVE FOLDER IDs (images) ─────────────────────────────────────────────────
const SITES_IMG_FOLDER  = '1ShOd2m9UzPjuftceOeL2MdeYvkug4haU';
const HUMANS_IMG_FOLDER = '1PsqHbWRwurrVEpwhT-iRNGhjlf9jPgUx';
const CHORES_IMG_FOLDER = '1f_B10hFEsPg5WUHwpcbS86lq2EcPu_si';

// ── IMAGE COLUMNS per sheet ───────────────────────────────────────────────────
const SITES_IMG_COLS  = ['Main Image','Image 2','Image 3',
                          'Helpful Image 1','Helpful Image 2','Helpful Before Image'];
const HUMANS_IMG_COLS = ['Main Image'];
const CHORES_IMG_COLS = ['Helpful Image 1'];

// Maps a path prefix to its Drive folder ID
const IMG_PREFIX_MAP = {
  'Sites_Images/':  SITES_IMG_FOLDER,
  'Humans_Images/': HUMANS_IMG_FOLDER,
  'Chores_Images/': CHORES_IMG_FOLDER,
  'Chores_Files_/': CHORES_IMG_FOLDER
};

// ── BLOCKED COLUMNS ───────────────────────────────────────────────────────────
const BLOCKED_H = ['Comments', 'Rating 1', 'Rating 2', 'Rating 3', 'Password'];
const BLOCKED_S = ['Comments'];

// ── PLANT FIELD CONFIG ────────────────────────────────────────────────────────
const PLANT_CARD_FIELDS = [
  'Common Name', 'Botanical Name', 'Plant type',
  'Color', 'Sun', 'Water', 'Flowering season', 'Main Image'
];
const PLANT_SEARCH_FIELDS = [
  'Common Name', 'Botanical Name', 'Alternative names',
  'Color', 'Special uses', 'Plant type'
];



// ── ONE-TIME MIGRATION: Site Names → Site Keys in Chores and Humans sheets ──
// Runs on every doGet until the Script Property 'migration_site_keys_v1' = 'done'.
// Safe to re-run (idempotent): already-converted Keys are left unchanged.
function migrateSiteNamesToKeys() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migration_site_keys_v1') === 'done') return;

  try {
    // Build Name → Key map from Sites sheet
    var sitesData = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites').getDataRange().getValues();
    var sh = sitesData[0];
    var ski = sh.indexOf('Key');   // col A
    var sni = sh.indexOf('Name');  // col B
    if (ski === -1 || sni === -1) return;

    var nameToKey = {};
    var allKeys   = {};
    for (var r = 1; r < sitesData.length; r++) {
      var k = String(sitesData[r][ski] || '').trim();
      var n = String(sitesData[r][sni] || '').trim();
      if (k) allKeys[k] = true;
      if (k && n) nameToKey[n.toLowerCase()] = k;
    }

    // ── Migrate Chores sheet: Site column ────────────────────────────────────
    var choresSheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
    var choresData  = choresSheet.getDataRange().getValues();
    var ch = choresData[0];
    var csi = ch.indexOf('Site');
    if (csi > -1) {
      for (var cr = 1; cr < choresData.length; cr++) {
        var val = String(choresData[cr][csi] || '').trim();
        if (!val) continue;
        if (allKeys[val]) continue; // already a Key — skip
        var resolved = nameToKey[val.toLowerCase()];
        if (resolved) {
          choresSheet.getRange(cr + 1, csi + 1).setValue(resolved);
          Logger.log('Chores migration: row ' + (cr+1) + ' "' + val + '" → "' + resolved + '"');
        }
      }
    }

    // ── Migrate Humans sheet: School column ──────────────────────────────────
    var humansSheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
    var humansData  = humansSheet.getDataRange().getValues();
    var hh = humansData[0];
    var hsi = hh.indexOf('School');
    if (hsi > -1) {
      for (var hr = 1; hr < humansData.length; hr++) {
        var hval = String(humansData[hr][hsi] || '').trim();
        if (!hval) continue;
        // School can hold multiple comma-separated names — handle each part
        var parts   = hval.split(/[,\n]+/).map(function(x){ return x.trim(); }).filter(Boolean);
        var updated = parts.map(function(p) {
          if (allKeys[p]) return p; // already a Key
          return nameToKey[p.toLowerCase()] || p; // resolve or leave as-is
        });
        var newVal = updated.join(', ');
        if (newVal !== hval) {
          humansSheet.getRange(hr + 1, hsi + 1).setValue(newVal);
          Logger.log('Humans migration: row ' + (hr+1) + ' "' + hval + '" → "' + newVal + '"');
        }
      }
    }

    props.setProperty('migration_site_keys_v1', 'done');
    Logger.log('Migration migration_site_keys_v1 complete.');
  } catch(e) {
    Logger.log('Migration error: ' + e.message);
    // Do NOT set 'done' — will retry next load
  }
}

// ── doGet ─────────────────────────────────────────────────────────────────────
function doGet(e) {
  // One-time migration: convert Site Names → Keys in Chores + Humans sheets
  migrateSiteNamesToKeys();

  // type=core   → Sites + Chores only  (fast first paint)
  // type=humans → Humans + Roles only  (loaded in background)
  // (default)   → everything           (backward-compatible / cache warm-up)
  var type = (e && e.parameter && e.parameter.type) || 'all';

  if (type === 'core') {
    var sitesMap  = getFolderIndex(SITES_IMG_FOLDER);
    var choresMap = getFolderIndex(CHORES_IMG_FOLDER);
    var sites  = readSheet(SITES_ID, 'Sites',  BLOCKED_S, SITES_IMG_COLS, sitesMap);
    var chores = getOpenChores(choresMap);
    return respond({ sites: sites, humans: [], roles: [], chores: chores });
  }

  if (type === 'humans') {
    var humansMap = getFolderIndex(HUMANS_IMG_FOLDER);
    var humans = readSheet(HUMANS_ID, 'Humans', BLOCKED_H, HUMANS_IMG_COLS, humansMap);
    var roles  = getRoles();
    return respond({ humans: humans, roles: roles });
  }

  // 'all' — full payload (backward compat)
  var sitesMap  = getFolderIndex(SITES_IMG_FOLDER);
  var humansMap = getFolderIndex(HUMANS_IMG_FOLDER);
  var choresMap = getFolderIndex(CHORES_IMG_FOLDER);
  var sites  = readSheet(SITES_ID,  'Sites',  BLOCKED_S, SITES_IMG_COLS,  sitesMap);
  var humans = readSheet(HUMANS_ID, 'Humans', BLOCKED_H, HUMANS_IMG_COLS, humansMap);
  var roles  = getRoles();
  var chores = getOpenChores(choresMap);
  return respond({ sites: sites, humans: humans, roles: roles, chores: chores });
}


// ── doPost ────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);

    switch (p.action) {

      // ── PLANTS ──────────────────────────────────────────────────────────────
      case 'searchPlants': return respond(handleSearchPlants(p.query));
      case 'getPlant':     return respond(handleGetPlant(p.rowIndex));

      // ── AUTH ─────────────────────────────────────────────────────────────────
      case 'checkEmail':     return respond(handleCheckEmail(p));
      case 'setPassword':    return respond(handleSetPassword(p));
      case 'auth':           return respond(handleAuth(p));
      case 'forgotPassword': return respond(handleForgotPassword(p));

      // ── HUMANS / ROLES ───────────────────────────────────────────────────────
      case 'addHuman': return respond(handleAddHuman(p));
      case 'addRole':  return respond(handleAddRole(p));

      // ── CHORES ───────────────────────────────────────────────────────────────
      case 'reassignChore':  return respond(handleReassignChore(p));
      case 'closeChore':     return respond(handleCloseChore(p));
      case 'updateChore':    return respond(handleUpdateChore(p));
      case 'addChore':       return respond(handleAddChore(p));
      case 'uploadChoreImage': return respond(handleUploadChoreImage(p));
      case 'saveChore':      return respond(handleSaveChore(p));
      case 'deleteChore':    return respond(handleDeleteChore(p));
      case 'getSelfProfile': return respond(handleGetSelfProfile(p));
      case 'uploadSiteImage':  return respond(handleUploadSiteImage(p));
      case 'uploadHumanImage': return respond(handleUploadHumanImage(p));

      // ── ACTIVITY FEED ────────────────────────────────────────────────────────
      case 'getActivity': return respond(handleGetActivity());
      case 'logActivity':  return respond(handleLogActivity(p));

      // ── NOTES ────────────────────────────────────────────────────────────────
      case 'getNotes':  return respond(handleGetNotes(p));
      case 'saveNotes': return respond(handleSaveNotes(p));

      // ── APP SETTINGS (control panel) ─────────────────────────────────────────
      case 'getAppSettings':  return respond(handleGetAppSettings());
      case 'saveAppSettings': return respond(handleSaveAppSettings(p));

      // ── DELETE HUMAN ─────────────────────────────────────────────────────────
      case 'deleteHuman':   return respond(handleDeleteHuman(p));
      case 'getComments':   return respond(handleGetComments(p));
      case 'saveComments':  return respond(handleSaveComments(p));

      // ── CASCADE EMAIL CHANGE ─────────────────────────────────────────────────
      case 'cascadeEmail': return respond(handleCascadeEmail(p));

      // ── REACH / MEMOS ────────────────────────────────────────────────────────
      case 'sendMemo':      return respond(handleSendMemo(p));
      case 'sendMailMerge': return respond(handleSendMailMerge(p));
      case 'sendTwilioSms': return respond(handleSendTwilioSms(p));

      // ── DEFAULT: save edit ───────────────────────────────────────────────────
      default: return respond(handleSaveEdit(p));
    }

  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}


// ── Twilio Bulk SMS ───────────────────────────────────────────────────────────
// Called by Reach tab "Send via Twilio" button.
// Payload: { action:'sendTwilioSms', sid, keySid, keySecret, from,
//            messages:[{to, body}], actor }
// Auth: Twilio API Key (keySid:keySecret) with Account SID in URL.
function handleSendTwilioSms(payload) {
  var sid      = payload.sid       || '';
  var keySid   = payload.keySid    || '';
  var keySec   = payload.keySecret || '';
  var from     = payload.from      || '';
  var messages = payload.messages  || [];

  // Fall back to Script Properties if credentials not in payload
  var props = PropertiesService.getScriptProperties();
  if (!sid)    sid    = props.getProperty('twilio_sid')        || '';
  if (!keySid) keySid = props.getProperty('twilio_key_sid')    || '';
  if (!keySec) keySec = props.getProperty('twilio_key_secret') || '';
  if (!from)   from   = props.getProperty('twilio_from')       || '';
  // Ensure E.164 format
  if (from && from.charAt(0) !== '+') from = '+' + from;
  if (!sid || !keySid || !keySec || !from)
    return { ok: false, error: 'Missing Twilio credentials' };
  if (!messages.length)
    return { ok: false, error: 'No messages to send' };

  // Basic auth = base64(keySid:keySecret); Account SID goes in the URL
  var auth   = Utilities.base64Encode(keySid + ':' + keySec);
  var apiUrl = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';

  var sent = 0, failed = 0, errors = [];

  messages.forEach(function(m) {
    var toNumbers = Array.isArray(m.to) ? m.to : [m.to];
    toNumbers.forEach(function(toNum) {
      if (!toNum) return;
      try {
        var resp = UrlFetchApp.fetch(apiUrl, {
          method: 'post',
          headers: { 'Authorization': 'Basic ' + auth },
          payload: { To: toNum, From: from, Body: m.body },
          muteHttpExceptions: true
        });
        var code = resp.getResponseCode();
        if (code >= 200 && code < 300) {
          sent++;
        } else {
          failed++;
          errors.push(toNum + ': HTTP ' + code + ' — ' +
            resp.getContentText().substring(0, 120));
        }
      } catch(e) {
        failed++;
        errors.push(toNum + ': ' + e.message);
      }
    });
  });

  // Log to Activity sheet
  try {
    logActivity({
      action: 'sendTwilioSms',
      actor:  payload.actor || '',
      detail: 'Sent ' + sent + ' SMS, ' + failed + ' failed. ' +
              'Recipients: ' + messages.length
    });
  } catch(e) {}

  return { ok: true, sent: sent, failed: failed, errors: errors };
}

// ── IMAGE RESOLUTION ──────────────────────────────────────────────────────────

/**
 * Enumerates all files in a Drive folder and returns a { filename: fileId } map.
 * Cached in CacheService for 1 hour. Falls back to ScriptProperties if > 100 KB.
 */
function getFolderIndex(folderId) {
  var cacheKey = 'fdr_' + folderId;
  var cache    = CacheService.getScriptCache();
  var cached   = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  var map = {};
  try {
    var files = DriveApp.getFolderById(folderId).getFiles();
    while (files.hasNext()) {
      var f = files.next();
      map[f.getName()] = f.getId();
    }
  } catch(e) {
    Logger.log('getFolderIndex error [' + folderId + ']: ' + e.message);
  }

  var json = JSON.stringify(map);
  try {
    cache.put(cacheKey, json, 3600);
  } catch(e) {
    try { PropertiesService.getScriptProperties().setProperty(cacheKey, json); } catch(e2) {}
  }
  return map;
}

/**
 * Converts a relative image path (e.g. "Sites_Images/foo.jpg") to a
 * public lh3.googleusercontent.com URL.
 */
function resolveImage(path, folderMap) {
  if (!path || typeof path !== 'string') return '';
  var p = path.trim();
  if (!p) return '';
  if (p.startsWith('http')) return p;

  var folderId = null, filename = null;
  var prefixes = Object.keys(IMG_PREFIX_MAP);
  for (var i = 0; i < prefixes.length; i++) {
    if (p.startsWith(prefixes[i])) {
      folderId = IMG_PREFIX_MAP[prefixes[i]];
      filename = p.slice(prefixes[i].length);
      break;
    }
  }
  if (!folderId || !filename) return '';

  // Fast path: pre-built map
  if (folderMap && folderMap[filename]) {
    return 'https://lh3.googleusercontent.com/d/' + folderMap[filename];
  }

  // Slow path: live lookup for new files not yet in the cached index
  var ck = 'drv_' + folderId + '_' + filename.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 150);
  var cache = CacheService.getScriptCache();
  var cv = cache.get(ck);
  if (cv !== null) return cv;

  var url = '';
  try {
    var hits = DriveApp.getFolderById(folderId).getFilesByName(filename);
    if (hits.hasNext()) {
      url = 'https://lh3.googleusercontent.com/d/' + hits.next().getId();
    }
  } catch(e) {}
  try { cache.put(ck, url, 21600); } catch(e) {}
  return url;
}


// ── PLANTS ────────────────────────────────────────────────────────────────────

function getPlantSheet() {
  return SpreadsheetApp.openById(PLANTS_ID).getSheetByName('Plants');
}

function handleSearchPlants(query) {
  if (!query || query.trim().length < 2) {
    return { plants: [], query: query || '' };
  }

  var q        = query.trim().toLowerCase();
  var cacheKey = 'ps_' + q.replace(/[^a-z0-9]/g, '_').substring(0, 40);
  var cache    = CacheService.getScriptCache();
  var cached   = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var sheet   = getPlantSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  var cardIdx   = {};
  PLANT_CARD_FIELDS.forEach(function(h) { cardIdx[h] = headers.indexOf(h); });
  var searchIdx = PLANT_SEARCH_FIELDS.map(function(h) { return headers.indexOf(h); });

  var plants = [];
  for (var r = 1; r < allData.length; r++) {
    var row = allData[r];
    if (!row[cardIdx['Common Name']]) continue;
    var hit = searchIdx.some(function(ci) {
      return ci >= 0 && String(row[ci]).toLowerCase().indexOf(q) >= 0;
    });
    if (!hit) continue;
    var card = { _rowIndex: r };
    PLANT_CARD_FIELDS.forEach(function(h) {
      card[h] = cardIdx[h] >= 0 ? (row[cardIdx[h]] || '') : '';
    });
    plants.push(card);
    if (plants.length >= 40) break;
  }

  var result = { plants: plants, query: q };
  try { cache.put(cacheKey, JSON.stringify(result), 3600); } catch(ex) {}
  return result;
}

function handleGetPlant(rowIndex) {
  var sheet   = getPlantSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var row     = allData[rowIndex] || [];
  var plant   = {};
  headers.forEach(function(h, i) {
    plant[h || ('_col' + i)] = row[i] !== undefined ? row[i] : '';
  });
  var puIdx = headers.indexOf('Plant Page URL');
  if (puIdx >= 0) {
    plant['Plant Page URL'] = row[puIdx + 1] ? String(row[puIdx + 1]) : '';
  }
  return { plant: plant };
}


// ── AUTH HANDLERS ─────────────────────────────────────────────────────────────

function getHumansSheet() {
  return SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
}

function humansData() {
  var sheet = getHumansSheet();
  var data  = sheet.getDataRange().getValues();
  return { sheet: sheet, data: data, h: data[0] };
}

function handleCheckEmail(p) {
  var d = humansData();
  var ei = d.h.indexOf('Email'), pi = d.h.indexOf('Password'),
      ai = d.h.indexOf('Access Level'), fi = d.h.indexOf('First Name'),
      li = d.h.indexOf('Last Name');
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    var al = parseInt(d.data[r][ai]);
    if (!al || isNaN(al)) return { found: true, noAccess: true };
    var hasPw = d.data[r][pi] !== '' && d.data[r][pi] != null;
    return { found: true, hasPassword: hasPw,
             name: (String(d.data[r][fi]) + ' ' + String(d.data[r][li])).trim() };
  }
  return { found: false };
}

function handleSetPassword(p) {
  var d = humansData();
  var ei = d.h.indexOf('Email'), pi = d.h.indexOf('Password'),
      ai = d.h.indexOf('Access Level'), fi = d.h.indexOf('First Name'),
      li = d.h.indexOf('Last Name');
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    if (d.data[r][pi] !== '' && d.data[r][pi] != null)
      return { ok: false, error: 'Password already set' };
    d.sheet.getRange(r + 1, pi + 1).setValue(p.passwordHash);
    var _spName = (String(d.data[r][fi]) + ' ' + String(d.data[r][li])).trim();
    var _spLvl  = parseInt(d.data[r][ai]) || 3;
    logActivity(p.email, 'first sign-in', _spName, 'person', 'Level ' + _spLvl);
    return { ok: true, name: _spName, accessLevel: _spLvl };
  }
  return { ok: false, error: 'Email not found' };
}

function handleAuth(p) {
  var d = humansData();
  var ei = d.h.indexOf('Email'), pi = d.h.indexOf('Password'),
      ai = d.h.indexOf('Access Level'), fi = d.h.indexOf('First Name'),
      li = d.h.indexOf('Last Name');
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    if (String(d.data[r][pi]) !== String(p.passwordHash))
      return { ok: false, error: 'Incorrect password' };
    return { ok: true,
             name: (String(d.data[r][fi]) + ' ' + String(d.data[r][li])).trim(),
             accessLevel: parseInt(d.data[r][ai]) || 3 };
  }
  return { ok: false, error: 'Email not found' };
}

function handleForgotPassword(p) {
  var d = humansData();
  var ei = d.h.indexOf('Email'), pi = d.h.indexOf('Password');
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    d.sheet.getRange(r + 1, pi + 1).setValue('');
    MailApp.sendEmail(
      p.email,
      'Ranger Rover — Password Reset',
      'Your Ranger Rover password has been reset.\n\n' +
      'Visit the app, enter your email, and you will be prompted to set a new password.\n\n' +
      'https://tomasogrady-hub.github.io/ranger-rover\n\n— Enrich LA'
    );
    return { ok: true };
  }
  return { ok: false, error: 'Email not found' };
}


// ── HUMANS / ROLES HANDLERS ───────────────────────────────────────────────────

function handleAddHuman(p) {
  var sheet   = getHumansSheet();
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var emailIdx = headers.indexOf('Email');
  // Server-side duplicate guard
  if (emailIdx !== -1 && p.data['Email']) {
    var incomingEmail = String(p.data['Email']).toLowerCase().trim();
    for (var r = 1; r < allData.length; r++) {
      if (String(allData[r][emailIdx]).toLowerCase().trim() === incomingEmail) {
        return { ok: false, duplicate: true, error: 'Email already exists: ' + p.data['Email'] };
      }
    }
  }
  sheet.appendRow(headers.map(function(h) { return p.data[h] || ''; }));
  logActivity(p.actor||p.data['Email']||'', 'added person',
    String(p.data['Name']||p.data['Email']||''), 'person', String(p.data['Role']||''));
  return { ok: true };
}

function handleAddRole(p) {
  var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Roles')
           || SpreadsheetApp.openById(HUMANS_ID).insertSheet('Roles');
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var roleIdx = headers.indexOf('Role');
  if (roleIdx === -1) {
    sheet.appendRow([p.role]);
  } else {
    var row = headers.map(function(h) {
      if (h === 'Role')     return p.role;
      if (h === 'Category') return p.category || '';
      return '';
    });
    sheet.appendRow(row);
  }
  return { ok: true };
}


// ── CHORE HANDLERS ────────────────────────────────────────────────────────────

function handleReassignChore(p) {
  var sheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data  = sheet.getDataRange().getValues(), h = data[0];
  var ii    = h.indexOf('ID'), ai = h.indexOf('Assigned to');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][ii]) !== String(p.choreId)) continue;
    sheet.getRange(r + 1, ai + 1).setValue(p.newAssignee);
    return { ok: true };
  }
  return { ok: false, error: 'Chore not found' };
}

function handleCloseChore(p) {
  var sheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data  = sheet.getDataRange().getValues(), h = data[0];
  var ii    = h.indexOf('ID'), si = h.indexOf('Status'), di = h.indexOf('Date Closed');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][ii]) !== String(p.choreId)) continue;
    sheet.getRange(r + 1, si + 1).setValue('Closed');
    if (di > -1) sheet.getRange(r + 1, di + 1).setValue(new Date());
    logActivity(p.actor||'', 'closed chore',
      String(data[r][ii]||''), 'chore',
      String(data[r][h.indexOf('Task')]||'') + ' — ' + String(data[r][h.indexOf('Site')]||''));
    return { ok: true };
  }
  return { ok: false, error: 'Chore not found' };
}

function handleUpdateChore(p) {
  var sheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data  = sheet.getDataRange().getValues(), h = data[0];
  var ii    = h.indexOf('ID');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][ii]) !== String(p.choreId)) continue;
    var task_uc = String(data[r][h.indexOf('Task')]||'');
    var site_uc = String(data[r][h.indexOf('Site')]||'');
    Object.keys(p.updates).forEach(function(col) {
      var ci = h.indexOf(col);
      if (ci > -1) sheet.getRange(r + 1, ci + 1).setValue(p.updates[col]);
    });
    if ((p.updates['Status'] || '').toLowerCase() === 'closed') {
      var di = h.indexOf('Date Closed');
      if (di > -1) sheet.getRange(r + 1, di + 1).setValue(new Date());
    }
    var imgCols2 = ['Helpful Image 1','Helpful Image 2','Helpful Image 3'];
    var updatedCols = Object.keys(p.updates)
      .filter(function(c){ return imgCols2.indexOf(c) === -1; }).join(', ');
    if (updatedCols) logActivity(p.actor||'', 'updated chore', String(data[r][ii]||''), 'chore', task_uc + ' — ' + site_uc);
    return { ok: true };
  }
  return { ok: false, error: 'Chore not found' };
}

function handleAddChore(p) {
  var sheet   = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var headers = sheet.getDataRange().getValues()[0];
  var newId   = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      String(Date.now()) + String(Math.random()))
  ).substring(0, 8).replace(/[+/=]/g, 'x');

  // Guard: ensure Site column stores a Key, not a Name.
  // If the client sent a name (longer than 9 chars or not found in allKeys), resolve it.
  var siteVal = String(p.data['Site'] || '').trim();
  if (siteVal) {
    var sitesSheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
    var sd = sitesSheet.getDataRange().getValues(), sh = sd[0];
    var ski = sh.indexOf('Key'), sni = sh.indexOf('Name');
    var allKeys = {}, nameToKey = {};
    for (var sr = 1; sr < sd.length; sr++) {
      var k = ski > -1 ? String(sd[sr][ski] || '').trim() : '';
      var n = sni > -1 ? String(sd[sr][sni] || '').trim() : '';
      if (k) allKeys[k] = true;
      if (k && n) nameToKey[n.toLowerCase()] = k;
    }
    if (!allKeys[siteVal]) {
      // Not a known Key — try to resolve as a Name
      var resolved = nameToKey[siteVal.toLowerCase()];
      if (resolved) p.data['Site'] = resolved;
      // If still unresolvable, leave as-is (best effort)
    }
  }

  var row = headers.map(function(h) {
    if (h === 'Timestamp') return new Date();
    if (h === 'ID')        return newId;
    if (h === 'Status')    return p.data['Status'] || 'Open';
    return p.data[h] !== undefined ? p.data[h] : '';
  });
  sheet.appendRow(row);
  logActivity(p.actor||p.data['Asked by']||'', 'added chore',
    String(newId||''), 'chore',
    String(p.data['Task']||'') + ' — ' + String(p.data['Site']||''));
  return { ok: true, id: newId };
}

function handleUploadChoreImage(p) {
  try {
    var decoded  = Utilities.base64Decode(p.base64);
    // Normalise MIME: lh3 cannot serve HEIC; force JPEG if needed
    var safeMime = (p.mimeType && !/heic|heif/i.test(p.mimeType) && p.mimeType !== 'application/octet-stream') ? p.mimeType : 'image/jpeg';
    var safeName = (p.filename || 'chore.jpg').replace(/\.(heic|heif)$/i, '.jpg');
    var blob     = Utilities.newBlob(decoded, safeMime, safeName);
    var folder  = DriveApp.getFolderById(CHORES_IMG_FOLDER);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://lh3.googleusercontent.com/d/' + file.getId();
    if (p.choreId) {
      var sheet      = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
      var data       = sheet.getDataRange().getValues(), h = data[0];
      var ii         = h.indexOf('ID');
      var siteColIdx = h.indexOf('Site');
      var imgColName = p.imageCol || 'Helpful Image 1';
      var imgCol     = h.indexOf(imgColName);
      if (imgCol === -1) imgCol = h.indexOf('Helpful Image 1');
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][ii]) === String(p.choreId) && imgCol > -1) {
          sheet.getRange(r + 1, imgCol + 1).setValue(url);
          logActivity(p.actor||'', 'uploaded photo',
            String(data[r][h.indexOf('Task')]||p.choreId), 'chore',
            siteColIdx > -1 ? String(data[r][siteColIdx]||'') : '');
          break;
        }
      }
    }
    return { ok: true, url: url };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function handleSaveChore(p) {
  var sheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data  = sheet.getDataRange().getValues(), h = data[0];
  var ii    = h.indexOf('ID');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][ii]) !== String(p.choreId)) continue;
    Object.keys(p.updates).forEach(function(col) {
      var ci = h.indexOf(col);
      if (ci > -1) sheet.getRange(r + 1, ci + 1).setValue(p.updates[col]);
    });
    return { ok: true };
  }
  return { ok: false, error: 'Chore not found' };
}

function handleDeleteChore(p) {
  var sheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data  = sheet.getDataRange().getValues(), h = data[0];
  var ii    = h.indexOf('ID');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][ii]) === String(p.choreId)) {
      var task_dc = String(data[r][h.indexOf('Task')]||'');
      var site_dc = String(data[r][h.indexOf('Site')]||'');
      sheet.deleteRow(r + 1);
      logActivity(p.actor||'', 'deleted chore', String(p.choreId||''), 'chore', task_dc + ' — ' + site_dc);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Chore not found' };
}

function handleGetSelfProfile(p) {
  var d  = humansData();
  var ei = d.h.indexOf('Email');
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    var profile = {};
    d.h.forEach(function(k, i) {
      if (k === 'Password' || k === 'Rating 1' || k === 'Rating 2' || k === 'Rating 3') return;
      profile[k] = d.data[r][i] !== undefined ? d.data[r][i] : '';
    });
    return { ok: true, profile: profile };
  }
  return { ok: false, error: 'Profile not found' };
}


// ── SITE / HUMAN IMAGE UPLOADS ────────────────────────────────────────────────

function handleUploadSiteImage(p) {
  try {
    var decoded  = Utilities.base64Decode(p.base64);
    var safeMime = (p.mimeType && !/heic|heif/i.test(p.mimeType) && p.mimeType !== 'application/octet-stream') ? p.mimeType : 'image/jpeg';
    var safeName = (p.filename || 'site.jpg').replace(/\.(heic|heif)$/i, '.jpg');
    var blob     = Utilities.newBlob(decoded, safeMime, safeName);
    var folder  = DriveApp.getFolderById(SITES_IMG_FOLDER);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url     = 'https://lh3.googleusercontent.com/d/' + file.getId();
    var colMap  = { 'MainImage': 'Main Image', 'HelpImg1': 'Helpful Image 1', 'HelpImg2': 'Helpful Image 2' };
    var colName = colMap[p.fieldKey];
    var lookupVal = p.siteKey || p.siteName;
    if (lookupVal && colName) {
      var sheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
      var data  = sheet.getDataRange().getValues(), h = data[0];
      var ki2   = h.indexOf('Key'), ni = h.indexOf('Name'), ci = h.indexOf(colName);
      for (var r = 1; r < data.length; r++) {
        var rowKey  = ki2 > -1 ? String(data[r][ki2]).trim() : '';
        var rowName = ni  > -1 ? String(data[r][ni]).trim()  : '';
        if ((rowKey === String(lookupVal).trim() || rowName === String(lookupVal).trim()) && ci > -1) {
          sheet.getRange(r + 1, ci + 1).setValue(url);
          logActivity(p.actor||'', 'uploaded photo', rowKey||lookupVal, 'site', rowName + ' — ' + colName);
          break;
        }
      }
    }
    return { ok: true, url: url };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function handleUploadHumanImage(p) {
  try {
    var decoded = Utilities.base64Decode(p.base64);
    var blob    = Utilities.newBlob(decoded, p.mimeType || 'image/jpeg', p.filename || 'profile.jpg');
    var folder  = DriveApp.getFolderById(HUMANS_IMG_FOLDER);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://lh3.googleusercontent.com/d/' + file.getId();
    if (p.email) {
      var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
      var data  = sheet.getDataRange().getValues(), h = data[0];
      var ei    = h.indexOf('Email'), mi = h.indexOf('Main Image');
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][ei]).toLowerCase() === p.email.toLowerCase() && mi > -1) {
          sheet.getRange(r + 1, mi + 1).setValue(url);
          break;
        }
      }
    }
    return { ok: true, url: url };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}


// ── SAVE EDIT ─────────────────────────────────────────────────────────────────

var SITE_EMAIL_COLS  = ['Ranger 1','Ranger 2','Principal','School Administrative Assistant',
                        'Main Contact 1','Main Contact 2','Main Contact 3',
                        'Plant Manager','CPM','Teachers','Other Contacts','Garden Keeper'];
var CHORE_EMAIL_COLS = ['Asked by','Asked of','Assigned to'];

function handleCascadeEmail(p) {
  var oldE = String(p.oldEmail || '').trim().toLowerCase();
  var newE = String(p.newEmail || '').trim();
  if (!oldE) return { ok: false, error: 'oldEmail required' };

  var sitesSheet  = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
  var sitesData   = sitesSheet.getDataRange().getValues();
  var sh          = sitesData[0];
  var choresSheet = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var choresData  = choresSheet.getDataRange().getValues();
  var ch          = choresData[0];

  var siteChanges = 0, choreChanges = 0;

  SITE_EMAIL_COLS.forEach(function(col) {
    var ci = sh.indexOf(col);
    if (ci === -1) return;
    for (var r = 1; r < sitesData.length; r++) {
      var cell = String(sitesData[r][ci] || '');
      if (!cell.toLowerCase().includes(oldE)) continue;
      var parts   = cell.split(new RegExp('[,\\n]+')).map(function(x){ return x.trim(); });
      var updated = parts.map(function(x){
        return x.toLowerCase() === oldE ? newE : x;
      }).filter(Boolean).join(', ');
      sitesSheet.getRange(r + 1, ci + 1).setValue(updated);
      siteChanges++;
    }
  });

  CHORE_EMAIL_COLS.forEach(function(col) {
    var ci = ch.indexOf(col);
    if (ci === -1) return;
    for (var r = 1; r < choresData.length; r++) {
      var cell = String(choresData[r][ci] || '').trim();
      if (cell.toLowerCase() !== oldE) continue;
      choresSheet.getRange(r + 1, ci + 1).setValue(newE);
      choreChanges++;
    }
  });

  return { ok: true, siteChanges: siteChanges, choreChanges: choreChanges };
}

function handleSaveEdit(p) {
  var id     = p.sheet === 'Humans' ? HUMANS_ID : SITES_ID;
  var tab    = p.sheet === 'Humans' ? 'Humans'  : 'Sites';

  var sheet   = SpreadsheetApp.openById(id).getSheetByName(tab);
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  // p.key = 7-char Key (col A) for Sites, Email for Humans
  var ni      = headers.indexOf('Name');
  var ki      = headers.indexOf('Key');
  var ei      = headers.indexOf('Email');
  var pKey        = String(p.key || '').trim();
  var siteKey     = String((p.updates && p.updates['_siteKey'])      || '').trim();
  var piggyActor  = String((p.updates && p.updates['_logActor'])     || p.actor || '').trim();
  var piggyAction = String((p.updates && p.updates['_logAction'])    || '').trim();
  var piggySubj   = String((p.updates && p.updates['_logSubject'])   || '').trim();
  var piggySType  = String((p.updates && p.updates['_logSubjType'])  || '').trim();
  var piggyDetail = String((p.updates && p.updates['_logDetail'])    || '').trim();
  if (p.updates) {
    delete p.updates['_siteKey'];
    delete p.updates['_logActor'];
    delete p.updates['_logAction'];
    delete p.updates['_logSubject'];
    delete p.updates['_logSubjType'];
    delete p.updates['_logDetail'];
  }
  Logger.log('handleSaveEdit: pKey='+pKey+' siteKey='+siteKey+' ni='+ni+' ki='+ki);

  function rowMatches(r) {
    var rowKey   = ki > -1 ? String(data[r][ki]  || '').trim() : '';
    var rowEmail = ei > -1 ? String(data[r][ei]  || '').trim().toLowerCase() : '';
    // Sites: match on Key column (col A) — single reliable lookup, every row has a 7-char Key
    if (p.sheet !== 'Humans' && pKey && rowKey && rowKey === pKey) return true;
    // Humans: match on Email
    if (p.sheet === 'Humans' && pKey && rowEmail && rowEmail === pKey.toLowerCase()) return true;
    return false;
  }

  for (var r = 1; r < data.length; r++) {
    if (!rowMatches(r)) continue;
    Object.keys(p.updates).forEach(function(col) {
      var ci = headers.indexOf(col);
      if (ci > -1) sheet.getRange(r + 1, ci + 1).setValue(p.updates[col]);
    });
    var imgCols = ['Main Image','Helpful Image 1','Helpful Image 2','Image 2','Image 3'];
    var editedCols = Object.keys(p.updates)
      .filter(function(c){ return imgCols.indexOf(c) === -1; }).join(', ');
    var subjType = (p.sheet === 'Humans') ? 'person' : 'site';
    // For sites, log the display Name (col B) not the Key ID (col A)
    // For sites: log Key as subject (stable ID); for Humans: log Email
    var logSubject = String(p.key||'');
    if (p.sheet !== 'Humans') {
      // Ensure we store the Key (col A), not the Name
      var ki3 = headers.indexOf('Key');
      if (ki3 > -1 && String(data[r][ki3]||'').trim()) logSubject = String(data[r][ki3]).trim();
    }
    // Use piggybacked log fields from client if present, otherwise compute from row
    var finalActor  = piggyActor  || p.actor || '';
    var finalAction = piggyAction || 'edited';
    var finalSubj   = piggySubj   || logSubject;
    var finalSType  = piggySType  || subjType;
    var finalDetail = piggyDetail || editedCols;
    logActivity(finalActor, finalAction, finalSubj, finalSType, finalDetail);
    return { ok: true };
  }
  Logger.log('handleSaveEdit MISS: pKey='+pKey+' siteKey='+siteKey);
  return { ok: false, error: 'Row not found. Sent name=['+pKey+'] key=['+siteKey+']' };

}


// ── COMMENTS HANDLERS (level 1 & 2 only) ────────────────────────────────────
function handleGetComments(p) {
  var accessLevel = parseInt(p.accessLevel || '3');
  if (accessLevel > 2) return { ok: false, error: 'Not authorized' };
  var email = (p.email || '').toLowerCase().trim();
  if (!email) return { ok: false, error: 'No email provided' };
  var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
  var data  = sheet.getDataRange().getValues();
  var hdr   = data[0];
  var emailIdx    = hdr.indexOf('Email');
  var commentsIdx = hdr.indexOf('Comments');
  if (emailIdx === -1 || commentsIdx === -1) return { ok: false, error: 'Column not found' };
  for (var i = 1; i < data.length; i++) {
    if ((data[i][emailIdx] || '').toLowerCase().trim() === email) {
      return { ok: true, comments: data[i][commentsIdx] || '' };
    }
  }
  return { ok: false, error: 'Person not found' };
}

function handleSaveComments(p) {
  var accessLevel = parseInt(p.accessLevel || '3');
  if (accessLevel > 2) return { ok: false, error: 'Not authorized' };
  var email = (p.email || '').toLowerCase().trim();
  if (!email) return { ok: false, error: 'No email provided' };
  var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
  var data  = sheet.getDataRange().getValues();
  var hdr   = data[0];
  var emailIdx    = hdr.indexOf('Email');
  var commentsIdx = hdr.indexOf('Comments');
  if (emailIdx === -1 || commentsIdx === -1) return { ok: false, error: 'Column not found' };
  for (var i = 1; i < data.length; i++) {
    if ((data[i][emailIdx] || '').toLowerCase().trim() === email) {
      sheet.getRange(i + 1, commentsIdx + 1).setValue(p.comments || '');
      logActivity(p.actor || '', 'edited comments', p.email, 'person', '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Person not found' };
}

// ── NOTES HANDLERS ────────────────────────────────────────────────────────────

function handleGetNotes(p) {
  var d  = humansData();
  var ei = d.h.indexOf('Email');
  var ni = d.h.indexOf('Your Notes');
  if (ni === -1) return { ok: true, notes: '' };
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    return { ok: true, notes: String(d.data[r][ni] || '') };
  }
  return { ok: false, error: 'User not found' };
}

function handleSaveNotes(p) {
  var d  = humansData();
  var ei = d.h.indexOf('Email');
  var ni = d.h.indexOf('Your Notes');
  if (ni === -1) return { ok: false, error: 'Your Notes column not found in Humans sheet' };
  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== p.email.toLowerCase()) continue;
    d.sheet.getRange(r + 1, ni + 1).setValue(p.notes || '');
    return { ok: true };
  }
  return { ok: false, error: 'User not found' };
}


// ── APP SETTINGS ──────────────────────────────────────────────────────────────

function handleGetAppSettings() {
  try {
    var props    = PropertiesService.getScriptProperties();
    var raw      = props.getProperty('app_settings');
    var settings = raw ? JSON.parse(raw) : { plantsEnabled: true, broadcast: '', navVisibility: {} };
    var gasUrl   = props.getProperty('gas_url') || '';
    // Merge Twilio credentials back in (stored separately for security)
    settings.twilioSid       = props.getProperty('twilio_sid')        || '';
    settings.twilioKeySid    = props.getProperty('twilio_key_sid')    || '';
    settings.twilioKeySecret = props.getProperty('twilio_key_secret') || '';
    settings.twilioFrom      = props.getProperty('twilio_from')       || '';
    return { ok: true, settings: settings, gasUrl: gasUrl };
  } catch(e) {
    return { ok: true, settings: { plantsEnabled: true, broadcast: '' }, gasUrl: '' };
  }
}

function handleSaveAppSettings(p) {
  try {
    var settings = p.settings || {};
    // Sanitise navVisibility: keys 1-9, values = arrays of known tab strings
    var KNOWN_TABS = ['notes','schools','map','chores','latest','rangers','people',
                      'plants','action','reach','settings','control'];
    var navVis = {};
    var rawVis = settings.navVisibility || {};
    for (var i = 1; i <= 9; i++) {
      var key = String(i);
      if (Array.isArray(rawVis[key])) {
        navVis[key] = rawVis[key].filter(function(t){ return KNOWN_TABS.indexOf(t) !== -1; });
      } else if (Array.isArray(rawVis[i])) {
        navVis[key] = rawVis[i].filter(function(t){ return KNOWN_TABS.indexOf(t) !== -1; });
      }
    }
    // Sanitise row3Slots: array of {label, tab, visibleLevels}
    var rawSlots = Array.isArray(rawVis.row3Slots) ? rawVis.row3Slots : [];
    var safeSlots = [];
    for (var si = 0; si < 6; si++) {
      var rs = rawSlots[si] || {};
      safeSlots.push({
        label: String(rs.label || '').slice(0, 30),
        tab: String(rs.tab || '').replace(/[^a-z0-9_-]/g, '').slice(0, 30),
        visibleLevels: Array.isArray(rs.visibleLevels)
          ? rs.visibleLevels.filter(function(lv){ return lv >= 1 && lv <= 9; })
          : []
      });
    }
    navVis.row3Slots = safeSlots;
    var safe = {
      plantsEnabled: settings.plantsEnabled !== false,
      broadcast: String(settings.broadcast || '').slice(0, 500),
      navVisibility: navVis
    };
    PropertiesService.getScriptProperties().setProperty('app_settings', JSON.stringify(safe));
    // Store Twilio credentials separately (never bundled into app_settings)
    var props = PropertiesService.getScriptProperties();
    if (settings.twilioSid)       props.setProperty('twilio_sid',        String(settings.twilioSid).trim());
    if (settings.twilioKeySid)    props.setProperty('twilio_key_sid',    String(settings.twilioKeySid).trim());
    if (settings.twilioKeySecret) props.setProperty('twilio_key_secret', String(settings.twilioKeySecret).trim());
    if (settings.twilioFrom)      props.setProperty('twilio_from',       String(settings.twilioFrom).trim());
    if (p.gasUrl) {
      PropertiesService.getScriptProperties().setProperty('gas_url', String(p.gasUrl).trim());
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}


// ── REACH / MEMOS ─────────────────────────────────────────────────────────────
//
// Logs each sent message to the Memos spreadsheet and sends via GmailApp.
//
// Memos sheet columns:
//   ID | Subject | Time+Date | To | From | CC | BCC | Message | Category | Type
//
// p.mode         — 'email_individual' | 'email_together'
// p.toEmails     — array of recipient addresses
// p.fromEmail    — sender (logged-in user's email)
// p.subject      — subject line
// p.message      — body text
// p.cc           — CC string (comma-separated, may be empty)
// p.bcc          — BCC string (comma-separated, may be empty)
// p.category     — optional category label

function handleSendMemo(p) {
  try {
    var mode      = String(p.mode      || 'email_together');
    var toEmails  = Array.isArray(p.toEmails) ? p.toEmails : [String(p.toEmails || '')];
    var fromEmail = String(p.fromEmail || '');
    var subject   = String(p.subject   || '(no subject)');
    var message   = String(p.message   || '');
    var cc        = String(p.cc        || '');
    var bcc       = String(p.bcc       || '');
    var category  = String(p.category  || '');
    var type      = mode === 'email_individual' ? 'Email Individual' : 'Email Together';
    var now       = new Date();

    // Open Memos sheet — auto-create if it doesn't exist yet
    var ss    = SpreadsheetApp.openById(MEMOS_ID);
    var sheet = ss.getSheetByName('Memos');
    if (!sheet) {
      sheet = ss.insertSheet('Memos');
      sheet.appendRow(['ID','Subject','Time+Date','To','From','CC','BCC','Message','Category','Type']);
      sheet.setFrozenRows(1);
    }

    var sentCount = 0;
    var errors    = [];

    if (mode === 'email_individual') {
      // One email per recipient
      toEmails.forEach(function(toAddr) {
        toAddr = String(toAddr).trim();
        if (!toAddr) return;
        var id = Utilities.getUuid();
        try {
          GmailApp.sendEmail(toAddr, subject, message, {
            cc:   cc  || undefined,
            bcc:  bcc || undefined,
            name: fromEmail
          });
        } catch(mailErr) {
          errors.push(toAddr + ': ' + mailErr.message);
        }
        sheet.appendRow([id, subject, now, toAddr, fromEmail, cc, bcc, message, category, type]);
        sentCount++;
      });
    } else {
      // Single email to all recipients together
      var toStr = toEmails.join(', ');
      var id    = Utilities.getUuid();
      try {
        GmailApp.sendEmail(toStr, subject, message, {
          cc:   cc  || undefined,
          bcc:  bcc || undefined,
          name: fromEmail
        });
      } catch(mailErr) {
        errors.push(mailErr.message);
      }
      sheet.appendRow([id, subject, now, toStr, fromEmail, cc, bcc, message, category, type]);
      sentCount = toEmails.length;
    }

    logActivity(fromEmail, 'Sent Memo', subject, type, 'To: ' + toEmails.join(', '));

    return { ok: true, sent: sentCount, errors: errors.length ? errors : undefined };

  } catch(e) {
    return { ok: false, error: e.message };
  }
}


// ── MAIL MERGE ────────────────────────────────────────────────────────────────
//
// True server-side mail merge — no device mail app involved. Each entry in
// p.messages already has its own personalised subject + body (tokens like
// {{FirstName}} are substituted client-side before this call). Sends each
// email individually via GmailApp and logs every send to the Memos sheet.
//
// Payload: { action:'sendMailMerge', messages:[{to,subject,body}], fromEmail,
//            cc, bcc, category }

function handleSendMailMerge(p) {
  try {
    var messages  = Array.isArray(p.messages) ? p.messages : [];
    var fromEmail = String(p.fromEmail || '');
    var cc        = String(p.cc        || '');
    var bcc       = String(p.bcc       || '');
    var category  = String(p.category  || '');
    var now       = new Date();

    var ss    = SpreadsheetApp.openById(MEMOS_ID);
    var sheet = ss.getSheetByName('Memos');
    if (!sheet) {
      sheet = ss.insertSheet('Memos');
      sheet.appendRow(['ID','Subject','Time+Date','To','From','CC','BCC','Message','Category','Type']);
      sheet.setFrozenRows(1);
    }

    var sentCount = 0;
    var errors    = [];

    messages.forEach(function(m) {
      var to = String((m && m.to) || '').trim();
      if (!to) return;
      var subject = String((m && m.subject) || '(no subject)');
      var body    = String((m && m.body)    || '');
      var id      = Utilities.getUuid();
      try {
        GmailApp.sendEmail(to, subject, body, {
          cc:   cc  || undefined,
          bcc:  bcc || undefined,
          name: fromEmail
        });
        sentCount++;
      } catch (mailErr) {
        errors.push(to + ': ' + mailErr.message);
      }
      sheet.appendRow([id, subject, now, to, fromEmail, cc, bcc, body, category, 'Mail Merge']);
    });

    logActivity(fromEmail, 'Sent Mail Merge', messages.length + ' emails', 'Mail Merge',
      'To count: ' + messages.length + (errors.length ? ' · Failed: ' + errors.length : ''));

    return { ok: true, sent: sentCount, failed: errors.length, errors: errors.length ? errors : undefined };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ── SHARED HELPERS ────────────────────────────────────────────────────────────

function getOpenChores(imgMap) {
  try {
    var data = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores').getDataRange().getValues();
    var h    = data[0];
    var keep = ['ID','Site','Task','Additional Comments','Status','Timestamp',
                'Asked by','Asked of','Assigned to','Urgency','Type',
                'Helpful Image 1','Helpful Image 2','Helpful Image 3','Helpful Video'];
    var imgCols = ['Helpful Image 1','Helpful Image 2','Helpful Image 3'];
    return data.slice(1)
      .map(function(row) {
        var obj = {};
        h.forEach(function(k, i) { if (keep.indexOf(k) > -1) obj[k] = row[i]; });
        imgCols.forEach(function(col) {
          if (obj[col]) obj[col] = resolveImage(String(obj[col]), imgMap || {});
        });
        return obj;
      })
      .filter(function(r) {
        return (r.Status || '').toString().toLowerCase() === 'open' && r.Site;
      });
  } catch(e) { return []; }
}

function getRoles() {
  try {
    var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Roles');
    if (!sheet) return [];
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var nameIdx = headers.indexOf('Role');
    var descIdx = headers.indexOf('Description');
    var catIdx  = headers.indexOf('Category');
    if (nameIdx === -1) nameIdx = 0;
    return data.slice(1)
      .filter(function(row) { return row[nameIdx] && String(row[nameIdx]).trim() !== ''; })
      .map(function(row) {
        return {
          name:        String(row[nameIdx]).trim(),
          description: descIdx >= 0 ? String(row[descIdx] || '').trim() : '',
          category:    catIdx  >= 0 ? String(row[catIdx]  || '').trim().toLowerCase() : ''
        };
      });
  } catch(e) { return []; }
}

function readSheet(id, tab, blocked, imgCols, imgMap) {
  var data    = SpreadsheetApp.openById(id).getSheetByName(tab).getDataRange().getValues();
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(k, i) {
      if (blocked.indexOf(k) !== -1) return;
      var val = row[i];
      if (imgCols && imgCols.indexOf(k) >= 0 && val && typeof val === 'string') {
        val = resolveImage(val, imgMap || {});
      }
      obj[k] = val;
    });
    return obj;
  });
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── UTILITY / DEBUG FUNCTIONS ─────────────────────────────────────────────────

function testImageResolution() {
  try {
    var folder = DriveApp.getFolderById(SITES_IMG_FOLDER);
    Logger.log('Folder name: ' + folder.getName());
    var files = folder.getFiles();
    var count = 0, names = [];
    while (files.hasNext() && count < 3) { names.push(files.next().getName()); count++; }
    Logger.log('First few files: ' + JSON.stringify(names));
  } catch(e) { Logger.log('ERROR: ' + e.message); }
}

function clearImageCache() {
  var cache = CacheService.getScriptCache();
  cache.remove('fdr_' + SITES_IMG_FOLDER);
  cache.remove('fdr_' + HUMANS_IMG_FOLDER);
  cache.remove('fdr_' + CHORES_IMG_FOLDER);
  Logger.log('Image caches cleared');
}

function shareAllImagesPublicly() {
  var folders = [SITES_IMG_FOLDER, HUMANS_IMG_FOLDER, CHORES_IMG_FOLDER];
  folders.forEach(function(folderId) {
    var files = DriveApp.getFolderById(folderId).getFiles();
    while (files.hasNext()) {
      var file = files.next();
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch(e) { Logger.log('Could not share: ' + file.getName()); }
    }
  });
  Logger.log('Done — all image files are now publicly accessible');
}


// ── CLOUDINARY VIDEO CLEANUP ──────────────────────────────────────────────────
//
// SETUP (one-time):
//   Project Settings → Script Properties → Add:
//     cloudinary_api_key    = (your key)
//     cloudinary_api_secret = (your secret)
//   Then run createCleanupTrigger() once.

const CLOUDINARY_CLOUD = 'dtecnh1il';

function cleanupOldVideos() {
  var props     = PropertiesService.getScriptProperties();
  var apiKey    = props.getProperty('cloudinary_api_key');
  var apiSecret = props.getProperty('cloudinary_api_secret');
  if (!apiKey || !apiSecret) {
    Logger.log('⚠ Cloudinary credentials not set in Script Properties. Skipping.');
    return;
  }
  var deleteDays = parseInt(props.getProperty('video_delete_days') || '90');
  var cutoff     = new Date(Date.now() - deleteDays * 24 * 60 * 60 * 1000);

  var sheet  = SpreadsheetApp.openById(CHORES_ID).getSheetByName('Chores');
  var data   = sheet.getDataRange().getValues();
  var h      = data[0];
  var vidCol = h.indexOf('Helpful Video 1');
  var tsCol  = h.indexOf('Timestamp');
  if (vidCol === -1) { Logger.log('Helpful Video 1 column not found.'); return; }

  var deleted = 0;
  for (var r = 1; r < data.length; r++) {
    var url = String(data[r][vidCol] || '').trim();
    if (!url.includes('cloudinary.com')) continue;
    var rowDate = new Date(data[r][tsCol]);
    if (!rowDate || rowDate > cutoff) continue;

    var m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/);
    if (!m) continue;
    var publicId = m[1];
    var ts  = Math.round(Date.now() / 1000);
    var str = 'public_id=' + publicId + '&timestamp=' + ts + apiSecret;
    var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str)
      .map(function(b){ return ('0'+(b&0xff).toString(16)).slice(-2); }).join('');

    try {
      var resp   = UrlFetchApp.fetch(
        'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/video/destroy',
        { method:'post', muteHttpExceptions:true,
          payload: 'public_id='  + encodeURIComponent(publicId) +
                   '&timestamp=' + ts +
                   '&api_key='   + apiKey +
                   '&signature=' + sig }
      );
      var result = JSON.parse(resp.getContentText());
      if (result.result === 'ok') {
        sheet.getRange(r + 1, vidCol + 1).setValue('');
        deleted++;
        Logger.log('Deleted: ' + publicId);
      } else {
        Logger.log('Not deleted (' + publicId + '): ' + JSON.stringify(result));
      }
    } catch(e) {
      Logger.log('Error deleting ' + publicId + ': ' + e.message);
    }
  }
  Logger.log('Cleanup complete. Deleted ' + deleted + ' video(s).');
}

// Run this ONCE to schedule nightly cleanup at ~2am:
function createCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'cleanupOldVideos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupOldVideos')
    .timeBased().everyDays(1).atHour(2).create();
  Logger.log('Nightly cleanup trigger created (runs at ~2am).');
}


// ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
//
// Sheet: 'Activity' tab in the Ranger Rover Sites spreadsheet (SITES_ID)
// Columns: Timestamp | Actor | Action | Subject | SubjectType | Detail

function logActivity(actor, action, subject, subjectType, detail) {
  try {
    var ss    = SpreadsheetApp.openById(SITES_ID);
    var sheet = ss.getSheetByName('Activity');
    if (!sheet) {
      sheet = ss.insertSheet('Activity');
      sheet.appendRow(['Timestamp','Actor','Action','Subject','SubjectType','Detail']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      new Date(),
      String(actor       || ''),
      String(action      || ''),
      String(subject     || ''),
      String(subjectType || ''),
      String(detail      || '')
    ]);
    // Keep tidy: max 300 data rows
    var total = sheet.getLastRow();
    if (total > 301) sheet.deleteRows(2, total - 301);
  } catch(e) {
    Logger.log('logActivity error: ' + e.message);
  }
}

function handleLogActivity(p) {
  try {
    logActivity(
      String(p.actor      || ''),
      String(p.logAction  || p.action || ''),
      String(p.subject    || ''),
      String(p.subjectType|| ''),
      String(p.detail     || '')
    );
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function handleGetActivity() {
  try {
    var ss    = SpreadsheetApp.openById(SITES_ID);
    var sheet = ss.getSheetByName('Activity');
    if (!sheet || sheet.getLastRow() < 2) return { ok: true, items: [] };
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var tsIdx    = headers.indexOf('Timestamp');
    var actorIdx = headers.indexOf('Actor');
    var actIdx   = headers.indexOf('Action');
    var subjIdx  = headers.indexOf('Subject');
    var stIdx    = headers.indexOf('SubjectType');
    var detIdx   = headers.indexOf('Detail');
    if (tsIdx    === -1) tsIdx    = 0;
    if (actorIdx === -1) actorIdx = 1;
    if (actIdx   === -1) actIdx   = 2;
    if (subjIdx  === -1) subjIdx  = 3;
    if (stIdx    === -1) stIdx    = 4;
    if (detIdx   === -1) detIdx   = 5;
    var rows = data.slice(1).sort(function(a, b) {
      var ta = a[tsIdx] ? new Date(a[tsIdx]).getTime() : 0;
      var tb = b[tsIdx] ? new Date(b[tsIdx]).getTime() : 0;
      return tb - ta;
    });
    var items = rows.slice(0, 100).map(function(r) {
      var ts = r[tsIdx];
      return {
        ts:          ts ? new Date(ts).toISOString() : '',
        actor:       String(r[actorIdx] || ''),
        action:      String(r[actIdx]   || ''),
        subject:     String(r[subjIdx]  || ''),
        subjectType: String(r[stIdx]    || ''),
        detail:      String(r[detIdx]   || '')
      };
    }).filter(function(x){ return x.action; });
    return { ok: true, items: items };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

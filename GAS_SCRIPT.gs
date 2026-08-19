// ── SHEET IDs ────────────────────────────────────────────────────────────────
const SITES_ID  = '1fs9T_fhevN-6_NgaDV941-RaQMC5mF52yc8eDitgsJc';
const HUMANS_ID = '19s6gQeFJWeVcAezkE1Lg6MJcZ3C8-h-IdWmZUDT5cHk';
const CHORES_ID = '13PV1ahdjdelyT3iaZRmpunqKmIb8NjsNOs6Hw_Jw1Yo';
const PLANTS_ID = '1FFhvdCupYlTJnPQIyGwWDRmHtuhqKFi2whK9BgjSdHk';
const MEMOS_ID  = '13Sx_kJejX0gJ3FtnlCtnizr9Bjcna-ekvKe9q0U85ug';
const MASTER_SCHOOLS_ID = '1j1vjThg9FV0dj-qMP3RM8T_Lr-ujR2r6vANqhMPoFm8'; // full LA-area schools database used by "Add New Site" search

// ── FORMS (Operations > Forms) ────────────────────────────────────────────────
const FORMS_ID        = '1H0Mc9kX6XQElVMkq_ALUexEMlof6sAMYiUir8MpObEE'; // "Rover Forms" spreadsheet
const FORMS_TAB        = 'Forms';
const FORMS_PDF_FOLDER = '1yEYFzstRy9JC3N6zYWBnYqzyeguFpI_4'; // "PDF DERIVED FROM" folder
// Each form instance (row) tracks its own most-recently generated PDF, rather
// than a separate growing log — regenerating overwrites these two columns.
const FORMS_PDF_URL_COL  = 'PDF Generated';
const FORMS_PDF_DATE_COL = 'PDF Generated Date';

// Forms-sheet columns that are Yes/No questions, in the same order as the
// {{Q1_YESBOX}}/{{Q1_NOBOX}} .. {{Q6_YESBOX}}/{{Q6_NOBOX}} tokens in the template doc.
const FORMS_YESNO_COLS = [
  "Does the project involve campus greening (tree planting, gardens, etc)?",
  "Does the project impact asbestos or lead-containing materials (such as paint)?",
  "Does the project involve sustainable products or technologies?",
  "Does the project use chemicals or involve playground equipment?",
  "Does the project require OEHS environmental review?",
  "Does the project impact emerging technologies systems or products not covered by the District's current specifications?"
];
// Forms-sheet columns that map to plain {{Token}} merge fields in the template body.
const FORMS_TEXT_COL_TOKENS = {
  'School':              '{{SchoolName}}',
  'Principal':           '{{PrincipalName}}',
  'CPM':                 '{{CPMName}}',
  'Date of Event':       '{{DateOfEvent}}',
  'Project Proponent':   '{{ProjectProponent}}',
  'Project Description': '{{ProjectDescription}}'
};

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

// Password itself stays blocked (see BLOCKED_H) but the Data > People "All Active"
// filter needs to know whether someone has a password recorded at all, without
// ever exposing the value — so readSheet() converts it into a boolean flag.
const HUMANS_FLAG_COLS = { 'Password': 'Has Password' };

// ── PLANT FIELD CONFIG ────────────────────────────────────────────────────────
const PLANT_CARD_FIELDS = [
  'Common Name', 'Botanical Name', 'Plant type',
  'Color', 'Sun', 'Water', 'Flowering season', 'Main Image'
];
const PLANT_SEARCH_FIELDS = [
  'Common Name', 'Botanical Name', 'Alternative names',
  'Color', 'Special uses', 'Plant type'
];

// ── TEAM EMAIL SEARCH (Gmail API via service-account domain-wide delegation) ──
// Level-1-only feature: searches across enrichla.org team mailboxes for any
// thread involving a given contact email (e.g. a principal). Requires the
// service-account JSON key to be stored in Script Properties under 'gmail_sa_key'.
const GMAIL_SEARCH_TEAM_EMAILS = [
  'mauravelasco@enrichla.org',
  'recruit@enrichla.org',
  'team@enrichla.org',
  'tomasogrady@enrichla.org',
  'hillarywilliams@enrichla.org',
  'catrinaestrada@enrichla.org',
  'invoices@enrichla.org',
  'johannarecalde@enrichla.org',
  'alexaleshire@enrichla.org'
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

// ── ONE-TIME MIGRATION: add Operations financial columns to Sites sheet ──────
// Runs on every doGet until the Script Property 'migration_ops_cols_v1' = 'done'.
// Safe to re-run (idempotent): only appends headers that don't already exist.
function ensureOperationsColumns() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migration_ops_cols_v1') === 'done') return;

  try {
    var sheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var needed = ['Adjustment', 'Ranger Program Units', 'Total Cost', 'Quote Number',
                  'Unit Description', 'PO Number', 'Financial Notes', 'Amount Owed',
                  'Amount Paid', 'Other Notes', 'Status'];
    var toAdd = needed.filter(function(h) { return headers.indexOf(h) === -1; });
    if (toAdd.length) {
      sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
      Logger.log('ensureOperationsColumns: added ' + toAdd.join(', '));
    }
    props.setProperty('migration_ops_cols_v1', 'done');
  } catch (e) {
    Logger.log('ensureOperationsColumns error: ' + e.message);
    // Do NOT set 'done' — will retry next load
  }
}

// ── ONE-TIME MIGRATION: add ranger home-geocode cache columns to Humans sheet ──
// Adds 'Home LatLng' (cached "lat,lng") and 'Home LatLng Src' (the exact address
// string that was geocoded to produce it, used to detect when an address has
// changed and needs re-geocoding). Runs lazily — only when the Smart Map's
// Rangers layer is first used — so it never slows down normal doGet loads.
function ensureRangerLatLngColumns(sheet) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migration_ranger_latlng_cols_v1') === 'done') return;
  try {
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var needed = ['Home LatLng', 'Home LatLng Src'];
    var toAdd = needed.filter(function(h) { return headers.indexOf(h) === -1; });
    if (toAdd.length) {
      sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
      Logger.log('ensureRangerLatLngColumns: added ' + toAdd.join(', '));
    }
    props.setProperty('migration_ranger_latlng_cols_v1', 'done');
  } catch (e) {
    Logger.log('ensureRangerLatLngColumns error: ' + e.message);
    // Do NOT set 'done' — will retry next call
  }
}

// ── SMART MAP: Rangers layer ────────────────────────────────────────────────
// Geocodes each ranger's home address (Street Address, City, State, Zip Code,
// Country — falling back to just Zip Code + Country when no street address is
// on file) and caches the result directly on the Humans sheet so repeat loads
// are instant reads instead of repeat geocode calls. Only re-geocodes a row
// when its address text has actually changed since the last cache write.
// Processes new/changed addresses in bounded batches (GEOCODE_BATCH_LIMIT) to
// stay well inside the Apps Script execution time limit; the client calls
// again (using the returned "remaining" count) until every row is cached.
var GEOCODE_BATCH_LIMIT = 40;
var RANGER_ROLE_CATS = {
  'master ranger':  'master_ranger',
  'garden keeper':  'garden_keeper',
  'applicant':      'ranger_applicant',
  'past':           'ranger_past',
  'ranger':         'ranger'
};
function _rangerRoleCategory(roleText) {
  var r = String(roleText || '').toLowerCase();
  if (r.indexOf('master ranger') > -1) return 'master_ranger';
  if (r.indexOf('garden keeper') > -1) return 'garden_keeper';
  if (r.indexOf('applicant') > -1)     return 'ranger_applicant';
  if (r.indexOf('past') > -1)          return 'ranger_past';
  if (r.indexOf('ranger') > -1)        return 'ranger';
  return '';
}

function handleGetRangerLocations(p) {
  try {
    var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
    ensureRangerLatLngColumns(sheet);

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[h] = i; });

    var out = [];
    var toGeocode = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var roleText = (idx['Role'] !== undefined ? row[idx['Role']] : '') + ' ' +
                      (idx['Role Additional'] !== undefined ? row[idx['Role Additional']] : '');
      var cat = _rangerRoleCategory(roleText);
      if (!cat) continue;

      var street  = idx['Street Address'] !== undefined ? String(row[idx['Street Address']] || '').trim() : '';
      var city    = idx['City']           !== undefined ? String(row[idx['City']]           || '').trim() : '';
      var state   = idx['State']          !== undefined ? String(row[idx['State']]          || '').trim() : '';
      var zip     = idx['Zip Code']       !== undefined ? String(row[idx['Zip Code']]        || '').trim() : '';
      var country = idx['Country']        !== undefined ? String(row[idx['Country']]         || '').trim() : '';

      var addr;
      if (street) {
        addr = [street, city, state, zip, country].filter(function(x){return x;}).join(', ');
      } else if (zip) {
        addr = [zip, country || 'USA'].filter(function(x){return x;}).join(', ');
      } else {
        continue; // nothing usable to geocode
      }

      var email = idx['Email'] !== undefined ? String(row[idx['Email']] || '').trim() : '';
      var fn = idx['First Name'] !== undefined ? row[idx['First Name']] : '';
      var ln = idx['Last Name']  !== undefined ? row[idx['Last Name']]  : '';
      var name = (String(fn || '') + ' ' + String(ln || '')).trim();
      if (!name) name = (idx['Name'] !== undefined ? String(row[idx['Name']] || '') : '') || email;

      var cachedLL  = idx['Home LatLng']     !== undefined ? String(row[idx['Home LatLng']]     || '').trim() : '';
      var cachedSrc = idx['Home LatLng Src'] !== undefined ? String(row[idx['Home LatLng Src']] || '').trim() : '';

      if (cachedLL && cachedSrc === addr) {
        var parts = cachedLL.split(',');
        if (parts.length === 2) {
          var clat = parseFloat(parts[0]), clng = parseFloat(parts[1]);
          if (!isNaN(clat) && !isNaN(clng)) {
            out.push({ email: email, name: name, role: cat, lat: clat, lng: clng });
            continue;
          }
        }
      }
      toGeocode.push({ rowNum: r + 1, addr: addr, email: email, name: name, cat: cat });
    }

    var batch = toGeocode.slice(0, GEOCODE_BATCH_LIMIT);
    if (batch.length) {
      var geocoder = Maps.newGeocoder();
      batch.forEach(function(item) {
        try {
          var res = geocoder.geocode(item.addr);
          if (res && res.status === 'OK' && res.results && res.results.length) {
            var loc = res.results[0].geometry.location;
            sheet.getRange(item.rowNum, idx['Home LatLng'] + 1).setValue(loc.lat + ',' + loc.lng);
            sheet.getRange(item.rowNum, idx['Home LatLng Src'] + 1).setValue(item.addr);
            out.push({ email: item.email, name: item.name, role: item.cat, lat: loc.lat, lng: loc.lng });
          }
        } catch (geoErr) {
          Logger.log('Geocode failed for "' + item.addr + '": ' + geoErr.message);
        }
      });
    }

    return { ok: true, locations: out, remaining: Math.max(0, toGeocode.length - batch.length) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── doGet ─────────────────────────────────────────────────────────────────────
function doGet(e) {
  // One-time migration: convert Site Names → Keys in Chores + Humans sheets
  migrateSiteNamesToKeys();
  // One-time migration: add Operations financial columns to Sites sheet
  ensureOperationsColumns();

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
    var humans = readSheet(HUMANS_ID, 'Humans', BLOCKED_H, HUMANS_IMG_COLS, humansMap, HUMANS_FLAG_COLS);
    var roles  = getRoles();
    return respond({ humans: humans, roles: roles });
  }

  // 'all' — full payload (backward compat)
  var sitesMap  = getFolderIndex(SITES_IMG_FOLDER);
  var humansMap = getFolderIndex(HUMANS_IMG_FOLDER);
  var choresMap = getFolderIndex(CHORES_IMG_FOLDER);
  var sites  = readSheet(SITES_ID,  'Sites',  BLOCKED_S, SITES_IMG_COLS,  sitesMap);
  var humans = readSheet(HUMANS_ID, 'Humans', BLOCKED_H, HUMANS_IMG_COLS, humansMap, HUMANS_FLAG_COLS);
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
      case 'getRangerLocations': return respond(handleGetRangerLocations(p));
      case 'uploadSiteImage':  return respond(handleUploadSiteImage(p));
      case 'uploadHumanImage': return respond(handleUploadHumanImage(p));

      // ── PUBLIC SMS CONSENT PAGE (no login; token-verified) ───────────────────
      case 'publicSmsOptInStatus': return respond(handlePublicSmsOptInStatus(p));
      case 'publicSmsOptIn':       return respond(handlePublicSmsOptIn(p));

      // ── ACTIVITY FEED ────────────────────────────────────────────────────────
      case 'getActivity': return respond(handleGetActivity());
      case 'logActivity':  return respond(handleLogActivity(p));

      // ── NOTES ────────────────────────────────────────────────────────────────
      case 'getNotes':  return respond(handleGetNotes(p));
      case 'saveNotes': return respond(handleSaveNotes(p));

      // ── APP SETTINGS (control panel) ─────────────────────────────────────────
      case 'getAppSettings':  return respond(handleGetAppSettings());
      case 'saveAppSettings': return respond(handleSaveAppSettings(p));

      // ── ADD NEW SITE (search master schools DB + create row) ─────────────────
      case 'searchMasterSchools': return respond(handleSearchMasterSchools(p));
      case 'createSite':          return respond(handleCreateSite(p));
      case 'deleteSite':          return respond(handleDeleteSite(p));
      case 'getSchoolDistricts':  return respond(handleGetSchoolDistricts());

      // ── DELETE HUMAN ─────────────────────────────────────────────────────────
      case 'deleteHuman':   return respond(handleDeleteHuman(p));
      case 'getComments':   return respond(handleGetComments(p));
      case 'saveComments':  return respond(handleSaveComments(p));

      // ── PROGRAMS (Items All → Operations edit card dropdown) ────────────────
      case 'getPrograms':   return respond(handleGetPrograms());

      // ── CASCADE EMAIL CHANGE ─────────────────────────────────────────────────
      case 'cascadeEmail': return respond(handleCascadeEmail(p));

      // ── CLEAR RANGER/GARDEN KEEPER ASSIGNMENTS (role changed away from active Ranger) ──
      case 'clearRangerFromSites': return respond(handleClearRangerFromSites(p));

      // ── REACH / MEMOS ────────────────────────────────────────────────────────
      case 'sendMemo':      return respond(handleSendMemo(p));
      case 'listMemos':     return respond(handleListMemos(p));
      case 'sendMailMerge': return respond(handleSendMailMerge(p));
      case 'sendTwilioSms': return respond(handleSendTwilioSms(p));

      // ── TEAM EMAIL SEARCH (level 1 only) ─────────────────────────────────────
      case 'searchTeamEmails':    return respond(handleSearchTeamEmails(p));
      case 'requestEmailForward': return respond(handleRequestEmailForward(p));

      // ── FORMS (Operations > Forms) ────────────────────────────────────────────
      case 'getForms':        return respond(handleGetForms());
      case 'saveFormAnswers': return respond(handleSaveFormAnswers(p));
      case 'generateFormPdf': return respond(handleGenerateFormPdf(p));
      case 'emailFormPdf':    return respond(handleEmailFormPdf(p));

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

// ── TEAM EMAIL SEARCH (Gmail API, service-account impersonation) ────────────
// Reads service-account creds from Script Property 'gmail_sa_key' (paste the
// full downloaded JSON key file contents as the property value — do NOT hardcode
// it here). Requires domain-wide delegation to be authorized in the Workspace
// Admin console for the 'https://www.googleapis.com/auth/gmail.readonly' scope.
function _gmailSaCreds() {
  var raw = PropertiesService.getScriptProperties().getProperty('gmail_sa_key');
  if (!raw) throw new Error('Missing gmail_sa_key Script Property');
  return JSON.parse(raw);
}

// Mints a short-lived Gmail-readonly access token, impersonating subjectEmail
// (one of the team mailboxes), via a signed JWT exchanged at Google's OAuth endpoint.
function _gmailImpersonatedToken(subjectEmail) {
  var creds = _gmailSaCreds();
  var now = Math.floor(Date.now() / 1000);
  var header   = { alg: 'RS256', typ: 'JWT' };
  var claimSet = {
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
    sub:   subjectEmail
  };
  function b64(obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  }
  var toSign = b64(header) + '.' + b64(claimSet);
  var sigBytes = Utilities.computeRsaSha256Signature(toSign, creds.private_key);
  var signature = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, '');
  var jwt = toSign + '.' + signature;

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var body = JSON.parse(resp.getContentText());
  if (!body.access_token) {
    throw new Error('Token error for ' + subjectEmail + ': ' + resp.getContentText().substring(0, 200));
  }
  return body.access_token;
}

// Searches every mailbox in GMAIL_SEARCH_TEAM_EMAILS for messages involving
// contactEmail. Skips any mailbox that errors (e.g. delegation not yet propagated)
// rather than failing the whole request. Returns newest-first.
// Gmail API's `snippet` (and sometimes header) fields come back with HTML
// entities already baked in (e.g. an apostrophe as literal "&#39;"). Treating
// that as plain text — as we were — makes it show up as literal "&#39;" to a
// human reader instead of an actual apostrophe. Decode once at the source so
// every downstream consumer (the modal, the forward-request email) gets real text.
function _decodeHtmlEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
    .replace(/&amp;/g, '&'); // must be last, or it double-unescapes "&amp;lt;" etc.
}

function _gmailSearchTeamMailboxes(contactEmail, requesterEmail, maxPerMailbox) {
  maxPerMailbox = maxPerMailbox || 4;
  var results = [];
  requesterEmail = (requesterEmail || '').trim().toLowerCase();

  GMAIL_SEARCH_TEAM_EMAILS.forEach(function(mailbox) {
    try {
      var token = _gmailImpersonatedToken(mailbox);
      var q = encodeURIComponent(contactEmail);
      var listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + q + '&maxResults=' + maxPerMailbox;
      var listResp = UrlFetchApp.fetch(listUrl, {
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
      var listData = JSON.parse(listResp.getContentText());
      if (!listData.messages) return;

      listData.messages.forEach(function(m) {
        var msgUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id +
          '?format=metadata' +
          '&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To' +
          '&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Date' +
          '&metadataHeaders=Message-Id';
        var msgResp = UrlFetchApp.fetch(msgUrl, {
          headers: { Authorization: 'Bearer ' + token },
          muteHttpExceptions: true
        });
        var msg = JSON.parse(msgResp.getContentText());
        var headers = {};
        (msg.payload && msg.payload.headers || []).forEach(function(h) { headers[h.name] = h.value; });

        results.push({
          mailbox:   mailbox,
          threadId:  m.threadId,
          messageId: headers['Message-Id'] || headers['Message-ID'] || '',
          subject:   _decodeHtmlEntities(headers.Subject || '(no subject)'),
          from:      _decodeHtmlEntities(headers.From || ''),
          to:        _decodeHtmlEntities(headers.To || ''),
          cc:        _decodeHtmlEntities(headers.Cc || ''),
          bcc:       _decodeHtmlEntities(headers.Bcc || ''),
          date:      headers.Date || '',
          snippet:   _decodeHtmlEntities(msg.snippet || ''),
          labelIds:  msg.labelIds || []
        });
      });
    } catch (err) {
      results.push({ mailbox: mailbox, error: String(err) });
    }
  });

  // Cross-reference: build a map of the REQUESTER's own copies (by Message-ID),
  // so a message that landed in someone else's mailbox but was ALSO sent to/cc'd
  // to the requester can link to the requester's own copy instead — which
  // reliably opens, since they're always signed into their own account.
  var ownCopyByMsgId = {};
  results.forEach(function(r) {
    if (r.error || !r.messageId) return;
    if (r.mailbox === requesterEmail) {
      ownCopyByMsgId[r.messageId] = { threadId: r.threadId, labelIds: r.labelIds };
    }
  });
  results.forEach(function(r) {
    if (r.error) return;
    var participants = ((r.from || '') + ' ' + (r.to || '') + ' ' + (r.cc || '') + ' ' + (r.bcc || '')).toLowerCase();
    r.viewerIsParticipant = !!requesterEmail && participants.indexOf(requesterEmail) !== -1;
    if (r.mailbox !== requesterEmail && r.messageId && ownCopyByMsgId[r.messageId]) {
      r.ownCopyThreadId = ownCopyByMsgId[r.messageId].threadId;
      r.ownCopyLabelIds = ownCopyByMsgId[r.messageId].labelIds;
    }
  });

  results.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  return results;
}

// Payload: { action:'searchTeamEmails', contactEmail, accessLevel, actor }
// Level 1 always allowed. Level 2 allowed ONLY if the admin has explicitly
// opted level 2 into 'team_email_search_btn' via the Nav Visibility Control
// Panel — checked here server-side (not just hidden client-side), since this
// exposes team members' inbox content.
// Level 1 always authorized. Level 2 only if explicitly opted in via the
// Nav Visibility Control Panel ('team_email_search_btn' for that level).
// Anything else: not authorized. Shared by both handleSearchTeamEmails and
// handleRequestEmailForward since they expose/act on the same sensitive data.
function _teamEmailFeatureAuthorized(accessLevel) {
  if (accessLevel > 2) return false;
  if (accessLevel === 1) return true;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('app_settings');
    var settings = raw ? JSON.parse(raw) : {};
    var lvl2 = (settings.navVisibility && settings.navVisibility['2']) || [];
    return lvl2.indexOf('team_email_search_btn') !== -1;
  } catch (e) {
    return false;
  }
}

function handleSearchTeamEmails(p) {
  var accessLevel = parseInt(p.accessLevel || '3');
  if (!_teamEmailFeatureAuthorized(accessLevel)) return { ok: false, error: 'Not authorized' };
  var contactEmail = (p.contactEmail || '').trim().toLowerCase();
  if (!contactEmail || contactEmail.indexOf('@') === -1) {
    return { ok: false, error: 'Missing or invalid contactEmail' };
  }
  try {
    var results = _gmailSearchTeamMailboxes(contactEmail, p.actor || p.requesterEmail || '');
    return { ok: true, results: results };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Mirrors _gmailFolderFor on the frontend — "#all/" (All Mail) excludes Spam
// and Trash, so a message actually sitting in either would silently fail to
// open. Pick the folder that matches where the message actually lives.
function _gmailFolderFor(labelIds) {
  var l = labelIds || [];
  if (l.indexOf('TRASH') !== -1) return 'trash';
  if (l.indexOf('SPAM') !== -1) return 'spam';
  if (l.indexOf('DRAFT') !== -1) return 'drafts';
  if (l.indexOf('SENT') !== -1 && l.indexOf('INBOX') === -1) return 'sent';
  return 'all';
}

// Payload: { action:'requestEmailForward', mailbox, threadId, subject, from, date,
//            snippet, labelIds, contactEmail, requesterEmail, requesterName, accessLevel }
// Sends an email TO the mailbox owner (via the script's own authorized Gmail
// send — same mechanism as Memos/Reach) asking them to forward the specific
// thread to the requester. Sent as real HTML with an actual <a href> tag —
// a plain-text URL immediately followed by a signature line was getting
// mangled by some mail clients' auto-linkification (grabbing trailing text
// into the same "link"). An explicit anchor tag has no such ambiguity.
function handleRequestEmailForward(p) {
  var accessLevel = parseInt(p.accessLevel || '3');
  if (!_teamEmailFeatureAuthorized(accessLevel)) return { ok: false, error: 'Not authorized' };

  var mailbox   = (p.mailbox || '').trim().toLowerCase();
  var threadId  = (p.threadId || '').trim();
  var requester = (p.requesterEmail || '').trim().toLowerCase();
  if (!mailbox || mailbox.indexOf('@') === -1) return { ok: false, error: 'Missing mailbox' };
  if (!requester || requester.indexOf('@') === -1) return { ok: false, error: 'Missing requester email' };

  var requesterName = p.requesterName || requester;
  var subjectLine = 'Could you forward this email? — Ranger Rover';
  var gmailLink = threadId
    ? 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(mailbox) + '#' + _gmailFolderFor(p.labelIds) + '/' + encodeURIComponent(threadId)
    : '';

  // Fields may already be HTML-entity-decoded (via _decodeHtmlEntities in
  // _gmailSearchTeamMailboxes) if they came from a fresh search result, but
  // decode defensively here too in case a caller passes raw values.
  var subjectTxt = _decodeHtmlEntities(p.subject || '(no subject)');
  var fromTxt    = _decodeHtmlEntities(p.from || '');
  var toTxt      = _decodeHtmlEntities(p.to || '');
  var ccTxt      = _decodeHtmlEntities(p.cc || '');
  var snippetTxt = _decodeHtmlEntities(p.snippet || '');

  var plainBody =
    requesterName + ' is looking into ' + (p.contactEmail || 'a contact') + ' in Ranger Rover and found a matching ' +
    'email in your inbox, but can\'t open it directly.\n\n' +
    'Could you forward it to ' + requester + ' when you get a chance?\n\n' +
    'Subject: ' + subjectTxt + '\n' +
    (fromTxt ? 'From: ' + fromTxt + '\n' : '') +
    (toTxt ? 'To: ' + toTxt + '\n' : '') +
    (ccTxt ? 'Cc: ' + ccTxt + '\n' : '') +
    (p.date ? 'Date: ' + p.date + '\n' : '') +
    (snippetTxt ? '\nPreview: "' + snippetTxt + '"\n' : '') +
    (gmailLink ? '\nOpen it here: ' + gmailLink + '\n' : '') +
    '\nThanks!\n— Sent automatically by Ranger Rover on behalf of ' + requesterName;

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var htmlBody =
    '<p>' + _esc(requesterName) + ' is looking into <strong>' + _esc(p.contactEmail || 'a contact') +
    '</strong> in Ranger Rover and found a matching email in your inbox, but can&#39;t open it directly.</p>' +
    '<p>Could you forward it to <strong>' + _esc(requester) + '</strong> when you get a chance?</p>' +
    '<p><strong>Subject:</strong> ' + _esc(subjectTxt) + '<br>' +
    (fromTxt ? '<strong>From:</strong> ' + _esc(fromTxt) + '<br>' : '') +
    (p.date ? '<strong>Date:</strong> ' + _esc(p.date) + '<br>' : '') +
    '</p>' +
    (snippetTxt ? '<p><em>Preview:</em> &ldquo;' + _esc(snippetTxt) + '&rdquo;</p>' : '') +
    (gmailLink ? '<p><a href="' + gmailLink + '">Open it here</a></p>' : '') +
    '<p>Thanks!<br>— Sent automatically by Ranger Rover on behalf of ' + _esc(requesterName) + '</p>';

  try {
    GmailApp.sendEmail(mailbox, subjectLine, plainBody, {
      replyTo: requester,
      name: 'Ranger Rover',
      htmlBody: htmlBody
    });
    try {
      logActivity(requester, 'requested email forward', mailbox, 'human',
        'Re: "' + subjectTxt + '" (about ' + (p.contactEmail || '') + ')');
    } catch (e) {}
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

function getConsentSalt() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('CONSENT_TOKEN_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('CONSENT_TOKEN_SALT', salt);
  }
  return salt;
}

function computeConsentToken(email) {
  var salt = getConsentSalt();
  var raw  = String(email).trim().toLowerCase() + '|' + salt;
  var digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var hex = digestBytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  return hex.substring(0, 24);
}

function ensureHumansConsentCols(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var toAdd = [];
  if (headers.indexOf('SMS Consent') === -1) toAdd.push('SMS Consent');
  if (headers.indexOf('SMS Consent Date') === -1) toAdd.push('SMS Consent Date');
  if (toAdd.length) {
    sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
  }
}

function humansData() {
  var sheet = getHumansSheet();
  ensureHumansConsentCols(sheet);
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

// Resolves a Sites "School" value (which may be a Key or a raw typed Name) to
// its display Name, for activity-log purposes.
function _siteNameForAddedHuman(schoolValue) {
  if (!schoolValue) return '';
  try {
    var data = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites').getDataRange().getValues();
    var headers = data[0];
    var keyIdx  = headers.indexOf('Key');
    var nameIdx = headers.indexOf('Name');
    if (keyIdx === -1) keyIdx = 0;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][keyIdx]) === schoolValue || (nameIdx !== -1 && String(data[i][nameIdx]) === schoolValue)) {
        return nameIdx !== -1 ? String(data[i][nameIdx] || schoolValue) : schoolValue;
      }
    }
  } catch (e) {}
  return schoolValue;
}

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
  var _displayName = String(
    p.data['Name'] ||
    (String(p.data['First Name']||'') + ' ' + String(p.data['Last Name']||'')).trim() ||
    p.data['Email'] || ''
  );
  var _personEmail = String(p.data['Email']||'');
  var _role        = String(p.data['Role']||'');
  var _siteName    = _siteNameForAddedHuman(String(p.data['School']||''));
  // detail stores "email — role — site" so the client can hotlink to the NEW
  // person (not the actor who added them) while still showing role AND site.
  logActivity(p.actor||_personEmail||'', 'added person', _displayName, 'person',
    _personEmail + (_role ? (' — ' + _role) : '') + (_siteName ? (' — ' + _siteName) : ''));
  return { ok: true };
}

function handleAddRole(p) {
  // Only access levels 1–2 (admin/ops) may add new roles. Level 3 (field rangers) can
  // still select from existing roles, they just can't create new ones. This mirrors the
  // client-side gating in index.html (canManageRoles()) but is enforced here too since
  // the client can't be trusted alone.
  var accessLevel = parseInt(p.accessLevel || '3');
  if (accessLevel > 2) return { ok: false, error: 'Not authorized' };

  var roleName = String(p.role || '').trim();
  if (!roleName) return { ok: false, error: 'Role name is required' };

  var sheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Roles')
           || SpreadsheetApp.openById(HUMANS_ID).insertSheet('Roles');
  var headers  = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var roleIdx  = headers.indexOf('Role');
  var nameCol  = roleIdx === -1 ? 0 : roleIdx;

  // Case-insensitive, trimmed duplicate check — "Ranger", "ranger ", and "RANGER" are
  // all treated as the same role so the sheet doesn't accumulate near-duplicates.
  var data = sheet.getDataRange().getValues();
  var lowerName = roleName.toLowerCase();
  for (var r = 1; r < data.length; r++) {
    var existing = String(data[r][nameCol] || '').trim().toLowerCase();
    if (existing && existing === lowerName) {
      return { ok: true, alreadyExists: true }; // silently no-op; treat as success
    }
  }

  if (roleIdx === -1) {
    sheet.appendRow([roleName]);
  } else {
    var row = headers.map(function(h) {
      if (h === 'Role')     return roleName;
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
    profile.consentToken = computeConsentToken(p.email);
    return { ok: true, profile: profile };
  }
  return { ok: false, error: 'Profile not found' };
}


// ── PUBLIC SMS CONSENT (opt-in web page, no login required) ──────────────────
// Called from the public sms-opt-in.html page. Two ways to reach this page:
//  1. From the app's My Profile screen — includes ?email=&token= so the page
//     can be pre-filled; token is verified if present.
//  2. Directly (e.g. embedded on enrichla.org) — email + mobile are blank and
//     the ranger types them in. No token in this case; the email must match
//     an existing row in the Humans sheet before consent is recorded.
function handlePublicSmsOptIn(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var mobile = String(p.mobile || '').trim();
  var token = String(p.token || '').trim();
  if (!email) return { ok: false, error: 'Please enter your email address.' };
  if (token && token !== computeConsentToken(email)) {
    return { ok: false, error: 'Invalid or expired link' };
  }

  var d  = humansData();
  var ei = d.h.indexOf('Email');
  var mi = d.h.indexOf('Mobile');
  var ci = d.h.indexOf('SMS Consent');
  var di = d.h.indexOf('SMS Consent Date');
  var fi = d.h.indexOf('First Name');
  var li = d.h.indexOf('Last Name');

  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== email) continue;
    var consentBool = (p.consent === true || p.consent === 'true');
    if (mobile) d.sheet.getRange(r + 1, mi + 1).setValue(mobile);
    d.sheet.getRange(r + 1, ci + 1).setValue(consentBool ? 'TRUE' : 'FALSE');
    d.sheet.getRange(r + 1, di + 1).setValue(new Date());
    return {
      ok: true,
      consent: consentBool,
      name: (String(d.data[r][fi] || '') + ' ' + String(d.data[r][li] || '')).trim()
    };
  }
  return { ok: false, error: "We couldn't find that email in our records. Please check with your program administrator." };
}

// Lightweight lookup so the public page can pre-fill name/mobile/consent
// when opened from the app's My Profile link (email + token both present).
// Not used for the blank/manual-entry flow.
function handlePublicSmsOptInStatus(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var token = String(p.token || '').trim();
  if (!email || !token) return { ok: false, error: 'Missing email or token' };
  if (token !== computeConsentToken(email)) return { ok: false, error: 'Invalid or expired link' };

  var d  = humansData();
  var ei = d.h.indexOf('Email');
  var mi = d.h.indexOf('Mobile');
  var ci = d.h.indexOf('SMS Consent');
  var fi = d.h.indexOf('First Name');
  var li = d.h.indexOf('Last Name');

  for (var r = 1; r < d.data.length; r++) {
    if (String(d.data[r][ei]).toLowerCase() !== email) continue;
    return {
      ok: true,
      name: (String(d.data[r][fi] || '') + ' ' + String(d.data[r][li] || '')).trim(),
      mobile: String(d.data[r][mi] || ''),
      consent: String(d.data[r][ci] || '').trim().toUpperCase() === 'TRUE'
    };
  }
  return { ok: false, error: 'User not found' };
}


// ── SITE / HUMAN IMAGE UPLOADS ────────────────────────────────────────────────

function handleUploadSiteImage(p) {
  try {
    var colMap = { 'MainImage': 'Main Image', 'HelpImg1': 'Helpful Image 1', 'HelpImg2': 'Helpful Image 2',
                   'Image2': 'Image 2', 'Image3': 'Image 3', 'HelpBeforeImg': 'Helpful Before Image' };
    var colName = colMap[p.fieldKey];
    var lookupVal = p.siteKey || p.siteName;

    // Look up the row first so the uploaded filename can carry the real site name + column name
    var sheet, data, h, ki2, ni, ci, targetRow = -1, rowKey = '', rowName = '';
    if (lookupVal && colName) {
      sheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
      data  = sheet.getDataRange().getValues();
      h     = data[0];
      ki2   = h.indexOf('Key');
      ni    = h.indexOf('Name');
      ci    = h.indexOf(colName);
      for (var r = 1; r < data.length; r++) {
        var rk = ki2 > -1 ? String(data[r][ki2]).trim() : '';
        var rn = ni  > -1 ? String(data[r][ni]).trim()  : '';
        if ((rk === String(lookupVal).trim() || rn === String(lookupVal).trim())) {
          targetRow = r; rowKey = rk; rowName = rn;
          break;
        }
      }
    }

    var decoded  = Utilities.base64Decode(p.base64);
    var safeMime = (p.mimeType && !/heic|heif/i.test(p.mimeType) && p.mimeType !== 'application/octet-stream') ? p.mimeType : 'image/jpeg';
    var ext      = /png/i.test(safeMime) ? '.png' : '.jpg';
    var stamp    = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyyMMdd_HHmmss');
    var safeName = (rowName || lookupVal || 'Site') + '.' + (colName || p.fieldKey || 'Image') + '.' + stamp + ext;

    var blob = Utilities.newBlob(decoded, safeMime, safeName);
    var folder = DriveApp.getFolderById(SITES_IMG_FOLDER);
    var file  = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url   = 'https://lh3.googleusercontent.com/d/' + file.getId();

    if (targetRow > -1 && ci > -1) {
      sheet.getRange(targetRow + 1, ci + 1).setValue(url);
      // Record who uploaded it and when, in a companion "<Column> Info" column (auto-created if missing)
      var infoCol = colName + ' Info';
      var infoCi  = h.indexOf(infoCol);
      if (infoCi === -1) {
        infoCi = h.length;
        sheet.getRange(1, infoCi + 1).setValue(infoCol);
        h.push(infoCol);
      }
      var infoVal = (p.actor || '') + '|' + new Date().toISOString();
      sheet.getRange(targetRow + 1, infoCi + 1).setValue(infoVal);
      logActivity(p.actor||'', 'uploaded photo', rowKey||lookupVal, 'site', rowName + ' — ' + colName);
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

// ── CLEAR RANGER / GARDEN KEEPER ASSIGNMENTS ────────────────────────────────
// Called when a person's Role is changed away from active Ranger duty (e.g. to
// "Ranger Applicant" or "Ranger Past"). Scans the Sites sheet for that email in
// Ranger 1, Ranger 2, or Garden Keeper and blanks both the email and Name
// columns so the site no longer shows a ranger who is no longer active. Returns
// the list of affected schools (and which role(s) were cleared on each) so the
// client can show the admin exactly what changed.
var RANGER_ROLE_COLS = [
  { emailCol: 'Ranger 1',       nameCol: 'Ranger 1 Name',       label: 'Ranger 1' },
  { emailCol: 'Ranger 2',       nameCol: 'Ranger 2 Name',       label: 'Ranger 2' },
  { emailCol: 'Garden Keeper',  nameCol: 'Garden Keeper Name',  label: 'Garden Keeper' }
];
function handleClearRangerFromSites(p) {
  var email = String((p && p.email) || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'email required' };

  var sheet   = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var ni      = headers.indexOf('Name');

  var colIdx = RANGER_ROLE_COLS.map(function (c) {
    return { emailCi: headers.indexOf(c.emailCol), nameCi: headers.indexOf(c.nameCol), label: c.label };
  });

  var affected = []; // [{name, roles:[...]}]
  for (var r = 1; r < data.length; r++) {
    var clearedRoles = [];
    colIdx.forEach(function (c) {
      if (c.emailCi === -1) return;
      var cell = String(data[r][c.emailCi] || '').trim().toLowerCase();
      if (cell !== email) return;
      sheet.getRange(r + 1, c.emailCi + 1).setValue('');
      if (c.nameCi > -1) sheet.getRange(r + 1, c.nameCi + 1).setValue('');
      clearedRoles.push(c.label);
    });
    if (clearedRoles.length) {
      affected.push({ name: ni > -1 ? String(data[r][ni] || '') : '', roles: clearedRoles });
    }
  }

  if (affected.length) {
    var subjDetail = affected.map(function (a) { return a.name + ' (' + a.roles.join(', ') + ')'; }).join('; ');
    logActivity(p.actor || '', 'role change cleared ranger assignment', email, 'person', subjDetail);
  }

  return { ok: true, affectedSites: affected };
}

// ── ADD NEW SITE ──────────────────────────────────────────────────────────────
// Searches the full LA-area schools master database (separate spreadsheet, not
// the Sites sheet) by Name substring, so a user adding a new site can find and
// auto-fill it instead of typing everything by hand.
function handleSearchMasterSchools(p) {
  var q = String((p && p.query) || '').trim().toLowerCase();
  if (q.length < 2) return { ok: true, results: [] };
  var sheet = SpreadsheetApp.openById(MASTER_SCHOOLS_ID).getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];
  var ni = headers.indexOf('Name');
  if (ni === -1) return { ok: false, error: 'Name column not found in master schools database.' };
  var out = [];
  for (var r = 1; r < data.length && out.length < 30; r++) {
    var nm = String(data[r][ni] || '');
    if (nm.toLowerCase().indexOf(q) === -1) continue;
    var obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = data[r][i]; });
    out.push(obj);
  }
  return { ok: true, results: out };
}

// Creates a brand-new row in the Sites sheet — either from a selected master-
// database school (data pre-mapped by the client) or a bare Name for a manual
// "can't find your school" entry. Generates a fresh 7-char Key (col A), the
// same reliable ID scheme every other Sites row lookup depends on.
function handleCreateSite(p) {
  var sheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var ni = headers.indexOf('Name');
  var ki = headers.indexOf('Key');
  var incomingName = String((p.data && p.data['Name']) || '').trim();
  if (!incomingName) return { ok: false, error: 'School name is required.' };

  // Duplicate guard — exact (case-insensitive) Name match against existing Sites
  for (var r = 1; r < data.length; r++) {
    if (ni > -1 && String(data[r][ni] || '').trim().toLowerCase() === incomingName.toLowerCase()) {
      return {
        ok: false,
        duplicate: true,
        existingKey: ki > -1 ? String(data[r][ki] || '') : '',
        error: 'A site named "' + incomingName + '" already exists.'
      };
    }
  }

  var newKey = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(Date.now()) + String(Math.random()))
  ).substring(0, 7).replace(/[+/=]/g, 'x');

  var rowObj = {};
  headers.forEach(function (h) {
    if (!h) return;
    if (h === 'Key')         { rowObj[h] = newKey; return; }
    if (h === 'Type')        { rowObj[h] = (p.data['Type'] || 'Possible Ranger Program'); return; }
    if (h === 'Last Update') { rowObj[h] = new Date(); return; }
    rowObj[h] = (p.data[h] !== undefined && p.data[h] !== null) ? p.data[h] : '';
  });

  // If we have a raw principal email (scraped from the master schools DB, or
  // typed by hand), try to link it to an existing Human, or create one — but
  // never override a Principal the user explicitly picked in the edit card.
  var principalEmail = _resolvePrincipalForNewSite(p.data, incomingName, p.actor);
  if (principalEmail && headers.indexOf('Principal') > -1 && !String(rowObj['Principal'] || '').trim()) {
    rowObj['Principal'] = principalEmail;
  }

  var row = headers.map(function (h) { return h ? rowObj[h] : ''; });
  sheet.appendRow(row);

  logActivity(p.actor || '', 'added site', newKey, 'site', incomingName);
  return { ok: true, key: newKey, row: rowObj };
}

// Given a new site's raw principal fields (Principal Email Raw / Principal
// First Name Raw / Principal Last Name Raw, as scraped from the master schools
// DB), tries to find a matching Human by email. If found, fills in any missing
// first/last/name on that Human row. If not found, creates a new Human row for
// them (Role: Principal). Either way, returns the email to assign to the new
// site's Principal column — or '' if no raw email was supplied.
function _resolvePrincipalForNewSite(pData, siteName, actor) {
  var email = String((pData && pData['Principal Email Raw']) || '').trim();
  if (!email) return '';
  var firstName = String((pData && pData['Principal First Name Raw']) || '').trim();
  var lastName  = String((pData && pData['Principal Last Name Raw'])  || '').trim();

  var humansSheet = SpreadsheetApp.openById(HUMANS_ID).getSheetByName('Humans');
  var hData    = humansSheet.getDataRange().getValues();
  var hHeaders = hData[0];
  var hEmailIdx = hHeaders.indexOf('Email');
  var hFirstIdx = hHeaders.indexOf('First Name');
  var hLastIdx  = hHeaders.indexOf('Last Name');
  var hNameIdx  = hHeaders.indexOf('Name');
  if (hEmailIdx === -1) return email; // sheet shape unexpected — pass the email through anyway

  for (var r = 1; r < hData.length; r++) {
    if (String(hData[r][hEmailIdx] || '').trim().toLowerCase() !== email.toLowerCase()) continue;
    // Found an existing Human — fill in first/last/name only where currently blank
    if (hFirstIdx > -1 && firstName && !String(hData[r][hFirstIdx] || '').trim()) {
      humansSheet.getRange(r + 1, hFirstIdx + 1).setValue(firstName);
    }
    if (hLastIdx > -1 && lastName && !String(hData[r][hLastIdx] || '').trim()) {
      humansSheet.getRange(r + 1, hLastIdx + 1).setValue(lastName);
    }
    if (hNameIdx > -1 && (firstName || lastName) && !String(hData[r][hNameIdx] || '').trim()) {
      humansSheet.getRange(r + 1, hNameIdx + 1).setValue((firstName + ' ' + lastName).trim());
    }
    return String(hData[r][hEmailIdx]).trim();
  }

  // Not found — add a new Human row for this principal
  var newHumanRow = hHeaders.map(function (h) {
    if (h === 'Email')         return email;
    if (h === 'First Name')    return firstName;
    if (h === 'Last Name')     return lastName;
    if (h === 'Name')          return (firstName + ' ' + lastName).trim() || email;
    if (h === 'Role')          return 'Principal';
    if (h === 'School')        return siteName || '';
    if (h === 'Access Level')  return 3;
    return '';
  });
  humansSheet.appendRow(newHumanRow);
  logActivity(actor || '', 'added person', (firstName + ' ' + lastName).trim() || email, 'person',
    email + ' — Principal' + (siteName ? (' — ' + siteName) : ''));
  return email;
}

// Permanently removes a row from the Sites sheet by Key. Used by the
// "🗑 Delete Site" flow at the top of Operations Home.
function handleDeleteSite(p) {
  var sheet   = SpreadsheetApp.openById(SITES_ID).getSheetByName('Sites');
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var ki = headers.indexOf('Key');
  var ni = headers.indexOf('Name');
  var key = String(p.key || '').trim();
  if (!key) return { ok: false, error: 'No site key provided.' };
  for (var r = 1; r < data.length; r++) {
    if (ki > -1 && String(data[r][ki] || '').trim() === key) {
      var siteName = ni > -1 ? String(data[r][ni] || '') : key;
      sheet.deleteRow(r + 1);
      logActivity(p.actor || '', 'deleted site', key, 'site', siteName);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Site not found.' };
}

// Returns the distinct "School District" names from the "Items All" tab
// (same spreadsheet as Sites) — used to populate the District dropdown shown
// on the Add New Site draft card, before it's saved.
function handleGetSchoolDistricts() {
  var sheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Items All');
  if (!sheet) return { ok: false, error: '"Items All" tab not found.' };
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var ni = headers.indexOf('Name');
  var ti = headers.indexOf('Type');
  if (ni === -1 || ti === -1) return { ok: false, error: 'Expected Name/Type columns not found in Items All.' };
  var seen = {}, out = [];
  for (var r = 1; r < data.length; r++) {
    var type = String(data[r][ti] || '').trim().toLowerCase();
    if (type !== 'school district') continue;
    var nm = String(data[r][ni] || '').trim();
    if (!nm || seen[nm]) continue;
    seen[nm] = true;
    out.push(nm);
  }
  out.sort();
  return { ok: true, districts: out };
}

function handleSaveEdit(p) {
  var id     = p.sheet === 'Humans' ? HUMANS_ID : SITES_ID;
  var tab    = p.sheet === 'Humans' ? 'Humans'  : 'Sites';

  var sheet   = SpreadsheetApp.openById(id).getSheetByName(tab);
  if (p.sheet === 'Humans') ensureHumansConsentCols(sheet);
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

    // Recalculate Program Cost / Total Cost / Amount Owed if a relevant field just changed
    var recalcResult = null;
    if (p.sheet !== 'Humans') {
      var touchedFinancial = ['Program', 'Adjustment', 'Ranger Program Units', 'Amount Paid']
        .some(function(h) { return Object.prototype.hasOwnProperty.call(p.updates, h); });
      if (touchedFinancial) recalcResult = recalcSiteFinancials(sheet, headers, r);
    }

    var imgCols = ['Main Image','Helpful Image 1','Helpful Image 2','Image 2','Image 3','Helpful Before Image',
                   'Main Image Info','Helpful Image 1 Info','Helpful Image 2 Info','Image 2 Info','Image 3 Info','Helpful Before Image Info'];
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
    return { ok: true, recalc: recalcResult };
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
  var fnIdx       = hdr.indexOf('First Name');
  var lnIdx       = hdr.indexOf('Last Name');
  var commentsIdx = hdr.indexOf('Comments');
  if (emailIdx === -1 || commentsIdx === -1) return { ok: false, error: 'Column not found' };
  for (var i = 1; i < data.length; i++) {
    if ((data[i][emailIdx] || '').toLowerCase().trim() === email) {
      sheet.getRange(i + 1, commentsIdx + 1).setValue(p.comments || '');
      var _fn = fnIdx > -1 ? String(data[i][fnIdx] || '') : '';
      var _ln = lnIdx > -1 ? String(data[i][lnIdx] || '') : '';
      var _displayName = (_fn + ' ' + _ln).trim() || p.email;
      // subject = display name (for reading), detail = email (for the Latest
      // feed hotlink) — matches the convention in handleSaveEdit so the feed
      // links to the person whose comments were edited, not the editor.
      logActivity(p.actor || '', 'edited comments', _displayName, 'person', p.email);
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
    var settings = raw ? JSON.parse(raw) : { plantsEnabled: true, broadcast: '', opsNotes: '', navVisibility: {} };
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
    var props = PropertiesService.getScriptProperties();

    // navVisibility controls per-access-level security (what Level 3 field
    // rangers can and can't see) so it gets special protection: it is ONLY
    // ever changed when the caller explicitly sets p.updateNavVisibility===true
    // (the Nav Visibility panel, and the one-time migration backfill). Every
    // other save path here — Broadcast, Twilio, GAS URL, Ops Notes — always
    // sends its own full local copy of _appSettings as a convenience, and that
    // copy's navVisibility can be stale (e.g. this browser tab loaded settings
    // before another admin/session changed them). Previously this function
    // trusted whatever navVisibility arrived in the payload, so any one of
    // those unrelated saves could silently revert nav visibility to an old
    // snapshot — access toggles "changing themselves" with no one touching
    // them. Now unrelated saves always re-read and re-write the CURRENT
    // stored navVisibility untouched, so only an explicit nav-visibility save
    // can ever change it.
    var existingRaw = props.getProperty('app_settings');
    var existing    = existingRaw ? JSON.parse(existingRaw) : {};
    var navVis      = existing.navVisibility || {};

    if (p.updateNavVisibility === true) {
      // Sanitise navVisibility: keys 1-9, values = arrays of known tab strings
      var KNOWN_TABS = ['notes','schools','map','chores','latest','rangers','people',
                        'plants','action','operations','reach','settings','data',
                        'site_ops_btn','team_email_search_btn'];
      var rawVis = settings.navVisibility || {};
      navVis = {};
      for (var i = 1; i <= 9; i++) {
        var key = String(i);
        if (Array.isArray(rawVis[key])) {
          navVis[key] = rawVis[key].filter(function(t){ return KNOWN_TABS.indexOf(t) !== -1; });
        } else if (Array.isArray(rawVis[i])) {
          navVis[key] = rawVis[i].filter(function(t){ return KNOWN_TABS.indexOf(t) !== -1; });
        }
      }
      // Row 3 Future Slots feature was removed — row3Slots is no longer sanitised or
      // persisted here. Any leftover row3Slots value from an older save is simply
      // dropped since navVis is rebuilt from scratch above when updating.
      // Preserve the one-time migration tracker so newly-introduced toggle keys
      // (like "operations") don't look like they need backfilling on every load.
      navVis.__migratedKeys = Array.isArray(rawVis.__migratedKeys)
        ? rawVis.__migratedKeys.filter(function(t){ return typeof t === 'string'; }).slice(0, 50)
        : (Array.isArray(existing.navVisibility && existing.navVisibility.__migratedKeys)
            ? existing.navVisibility.__migratedKeys : []);
    }

    var safe = {
      plantsEnabled: settings.plantsEnabled !== false,
      broadcast: String(settings.broadcast || '').slice(0, 500),
      opsNotes: String(settings.opsNotes || '').slice(0, 20000),
      navVisibility: navVis
    };
    props.setProperty('app_settings', JSON.stringify(safe));
    // Store Twilio credentials separately (never bundled into app_settings)
    if (settings.twilioSid)       props.setProperty('twilio_sid',        String(settings.twilioSid).trim());
    if (settings.twilioKeySid)    props.setProperty('twilio_key_sid',    String(settings.twilioKeySid).trim());
    if (settings.twilioKeySecret) props.setProperty('twilio_key_secret', String(settings.twilioKeySecret).trim());
    if (settings.twilioFrom)      props.setProperty('twilio_from',       String(settings.twilioFrom).trim());
    if (p.gasUrl) {
      props.setProperty('gas_url', String(p.gasUrl).trim());
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

function handleListMemos(p) {
  try {
    var limit = p.limit ? parseInt(p.limit, 10) : 25;
    var ss    = SpreadsheetApp.openById(MEMOS_ID);
    var sheet = ss.getSheetByName('Memos');
    if (!sheet) return { ok: true, memos: [] };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: true, memos: [] };
    var headers = data[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[h] = i; });
    var rows = data.slice(1).reverse(); // newest first (sheet is append-ordered)
    var seen  = {};
    var memos = [];
    for (var i = 0; i < rows.length && memos.length < limit; i++) {
      var r = rows[i];
      var subject = String(r[idx['Subject']] || '');
      var message = String(r[idx['Message']] || '');
      if (!subject && !message) continue;
      // Mail merge / individual sends write one row per recipient with the same
      // template — de-dupe on subject+message so the picker shows unique templates.
      var key = subject + '||' + message;
      if (seen[key]) continue;
      seen[key] = true;
      memos.push({
        subject:   subject,
        message:   message,
        type:      String(r[idx['Type']] || ''),
        from:      String(r[idx['From']] || ''),
        timestamp: r[idx['Time+Date']] ? new Date(r[idx['Time+Date']]).toISOString() : ''
      });
    }
    return { ok: true, memos: memos };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

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
    var replyTo   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) ? fromEmail : undefined;

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
            cc:      cc  || undefined,
            bcc:     bcc || undefined,
            name:    fromEmail,
            replyTo: replyTo
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
          cc:      cc  || undefined,
          bcc:     bcc || undefined,
          name:    fromEmail,
          replyTo: replyTo
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
    var mode      = String(p.mode      || 'email_individual');
    var now       = new Date();
    // Reply-To lets the recipient hit "reply" and land in the actual app
    // user's inbox, even though the email is sent from the shared account.
    var replyTo   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) ? fromEmail : undefined;
    // The un-merged template (still has {{FirstName}} etc.) — this is what
    // gets logged to Memos so it can be reused later, NOT any one recipient's
    // personalised copy (which has their actual name/school filled in).
    var templateSubject = String(p.templateSubject || (messages[0] && messages[0].subject) || '');
    var templateMessage = String(p.templateMessage || (messages[0] && messages[0].body)    || '');

    var ss    = SpreadsheetApp.openById(MEMOS_ID);
    var sheet = ss.getSheetByName('Memos');
    if (!sheet) {
      sheet = ss.insertSheet('Memos');
      sheet.appendRow(['ID','Subject','Time+Date','To','From','CC','BCC','Message','Category','Type']);
      sheet.setFrozenRows(1);
    }

    var sentCount = 0;
    var errors    = [];
    var sentTo    = [];

    messages.forEach(function(m) {
      var to = String((m && m.to) || '').trim();
      if (!to) return;
      var subject = String((m && m.subject) || '(no subject)');
      var body    = String((m && m.body)    || '');
      var html    = (m && m.html) ? String(m.html) : null;
      try {
        var opts = {
          cc:      cc  || undefined,
          bcc:     bcc || undefined,
          name:    fromEmail,
          replyTo: replyTo
        };
        // When the client sent a personalised HTML version (school names as
        // real clickable links back into the app), send that as the rendered
        // body; the plain-text "body" still goes to Gmail as the fallback for
        // text-only clients.
        if (html) opts.htmlBody = html;
        GmailApp.sendEmail(to, subject, body, opts);
        sentCount++;
        sentTo.push(to);
      } catch (mailErr) {
        errors.push(to + ': ' + mailErr.message);
      }
    });

    // ONE row per send action — every actual recipient address, comma-separated,
    // in the "To" column; Subject/Message hold the original template so it's
    // reusable on a fresh set of people later (see handleListMemos).
    if (sentTo.length) {
      var id = Utilities.getUuid();
      sheet.appendRow([
        id, templateSubject, now, sentTo.join(', '), fromEmail, cc, bcc,
        templateMessage, category, mode === 'email_individual' ? 'Email Individual' : 'Email Together'
      ]);
    }

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

// ── PROGRAMS + RESPONSE OPTIONS (Items All → Operations dropdowns/filter) ──
function handleGetPrograms() {
  var itemsSheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Items All');
  if (!itemsSheet) return { programs: [], responses: [] };
  var data = itemsSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol   = headers.indexOf('Name');
  var typeCol   = headers.indexOf('Type');
  var type2Col  = headers.indexOf('Type 2');
  var amountCol = headers.indexOf('Amount');
  if ([nameCol, typeCol, type2Col, amountCol].indexOf(-1) !== -1) return { programs: [], responses: [] };

  var programs = [];
  var responses = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][typeCol] === 'enrichla product' && data[i][type2Col] === 'Program' && data[i][nameCol]) {
      programs.push({ name: data[i][nameCol], amount: data[i][amountCol] });
    }
    if (data[i][typeCol] === 'Question' && data[i][nameCol]) {
      responses.push(data[i][nameCol]);
    }
  }
  return { programs: programs, responses: responses };
}

// ── SITES FINANCIAL RECALCULATION ──────────────────────────────────────────────
// Mirrors the same logic already running in Rover Operations (JohannaEditSync.gs /
// pushFieldAndRecalcFinancials). This is necessary because handleSaveEdit writes via
// SpreadsheetApp directly — a script-driven edit — and installable onEdit triggers
// (like the Sites-bound handleSitesEdit) never fire for script-driven edits, only for
// edits made directly by a person through the Sheets UI. Without this, saving Program/
// Adjustment/Units/Amount Paid from the app would never recompute Program Cost, Total
// Cost, or Amount Owed.
function lookupProgramCostFromItemsAll(programName) {
  var itemsSheet = SpreadsheetApp.openById(SITES_ID).getSheetByName('Items All');
  if (!itemsSheet) return null;
  var data = itemsSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = headers.indexOf('Name');
  var amountCol = headers.indexOf('Amount');
  if (nameCol === -1 || amountCol === -1) return null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][nameCol] === programName) return data[i][amountCol];
  }
  return null;
}

function recalcSiteFinancials(sheet, headers, r) {
  var programCol = headers.indexOf('Program');
  var costCol    = headers.indexOf('Program Cost');
  var adjCol     = headers.indexOf('Adjustment');
  var unitsCol   = headers.indexOf('Ranger Program Units');
  var paidCol    = headers.indexOf('Amount Paid');
  var totalCol   = headers.indexOf('Total Cost');
  var owedCol    = headers.indexOf('Amount Owed');
  if ([programCol, costCol, adjCol, unitsCol, paidCol, totalCol, owedCol].indexOf(-1) !== -1) return null;

  var programName = sheet.getRange(r + 1, programCol + 1).getValue();
  var cost = programName ? lookupProgramCostFromItemsAll(programName) : '';
  sheet.getRange(r + 1, costCol + 1).setValue(cost !== null ? cost : '');

  var costNum  = parseFloat(cost)  || 0;
  var adjNum   = parseFloat(sheet.getRange(r + 1, adjCol   + 1).getValue()) || 0;
  var unitsNum = parseFloat(sheet.getRange(r + 1, unitsCol + 1).getValue()) || 0;
  var paidNum  = parseFloat(sheet.getRange(r + 1, paidCol  + 1).getValue()) || 0;

  var total = (unitsNum * costNum) + adjNum;
  var owed  = total - paidNum;

  sheet.getRange(r + 1, totalCol + 1).setValue(total);
  sheet.getRange(r + 1, owedCol  + 1).setValue(owed);

  return { programCost: cost, totalCost: total, amountOwed: owed };
}

function readSheet(id, tab, blocked, imgCols, imgMap, flagCols) {
  var data    = SpreadsheetApp.openById(id).getSheetByName(tab).getDataRange().getValues();
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(k, i) {
      // Some blocked columns (e.g. Password) can still expose a boolean
      // "has a value" flag under a different key, without ever sending the
      // real value to the client.
      if (flagCols && flagCols[k]) {
        var raw = row[i];
        obj[flagCols[k]] = !(raw === '' || raw === null || raw === undefined);
        return;
      }
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


// ── FORMS (Operations > Forms) ─────────────────────────────────────────────────
// The "Forms" tab in the Rover Forms sheet doubles as both the form-template
// registry AND the answer store: each row is one form instance. Its "Actual
// Form" column holds the Drive file ID (or URL) of a Google Doc template that
// contains {{Token}} merge fields — see FORMS_TEXT_COL_TOKENS / FORMS_YESNO_COLS.

function _formsSheet() {
  return SpreadsheetApp.openById(FORMS_ID).getSheetByName(FORMS_TAB);
}

function _extractDriveId(idOrUrl) {
  var s = String(idOrUrl || '').trim();
  var m = s.match(/[-\w]{25,}/);
  return m ? m[0] : s;
}

function handleGetForms() {
  var data    = _formsSheet().getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1)
    .filter(function(row) { return row.some(function(v) { return v !== '' && v !== null; }); })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
  return {
    forms: rows,
    yesNoCols: FORMS_YESNO_COLS,
    // Fillable free-text columns = every header except ID / Form Name / Actual Form /
    // yes-no cols / the system-managed PDF-tracking columns.
    textCols: headers.filter(function(h) {
      return ['ID', 'Form Name', 'Actual Form', FORMS_PDF_URL_COL, FORMS_PDF_DATE_COL].indexOf(h) === -1
        && FORMS_YESNO_COLS.indexOf(h) === -1;
    })
  };
}

function handleSaveFormAnswers(p) {
  var id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing form id' };
  var sheet   = _formsSheet();
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol   = headers.indexOf('ID');
  var rowIdx  = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol]) === id) { rowIdx = r; break; }
  }
  if (rowIdx === -1) return { ok: false, error: 'Form not found: ' + id };

  var answers = p.answers || {};
  Object.keys(answers).forEach(function(key) {
    var colIdx = headers.indexOf(key);
    if (colIdx === -1) return; // ignore unknown columns
    sheet.getRange(rowIdx + 1, colIdx + 1).setValue(answers[key]);
  });
  return { ok: true };
}

// Fills a copy of the form's template doc with the row's current answers,
// exports it as a PDF into the "PDF DERIVED FROM" folder, and writes the
// result back into that same row (PDF Generated / PDF Generated Date columns)
// so re-generating after an edit simply replaces the row's live PDF rather
// than piling up a separate log entry per attempt.
function _generateFilledFormPdf(id) {
  var sheet   = _formsSheet();
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol   = headers.indexOf('ID');
  var rowIdx  = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol]) === id) { rowIdx = r; break; }
  }
  if (rowIdx === -1) throw new Error('Form not found: ' + id);
  var row = data[rowIdx];

  var rowObj = {};
  headers.forEach(function(h, i) { rowObj[h] = row[i]; });

  var templateId = _extractDriveId(rowObj['Actual Form']);
  if (!templateId) throw new Error('This form has no template linked in "Actual Form"');

  var folder   = DriveApp.getFolderById(FORMS_PDF_FOLDER);
  var baseName = (rowObj['Form Name'] || 'Form') + ' - ' + (rowObj['School'] || 'Untitled') + ' - ' + new Date().toISOString();
  var copyFile = DriveApp.getFileById(templateId).makeCopy(baseName, folder);
  var doc      = DocumentApp.openById(copyFile.getId());
  var body     = doc.getBody();

  function esc(v) { return String(v).replace(/[{}]/g, '\\$&'); }
  function escVal(v) { return String(v).replace(/\$/g, '$$$$'); } // avoid $1-style backreferences in replacement

  // Plain text merge fields
  Object.keys(FORMS_TEXT_COL_TOKENS).forEach(function(col) {
    var token = FORMS_TEXT_COL_TOKENS[col];
    body.replaceText(esc(token), escVal(rowObj[col] || ''));
  });

  // Yes/No checkbox tokens, in FORMS_YESNO_COLS order
  FORMS_YESNO_COLS.forEach(function(col, i) {
    var n    = i + 1;
    var ans  = String(rowObj[col] || '').trim().toLowerCase();
    var yesG = (ans === 'yes') ? '\u2612' : '\u2610';
    var noG  = (ans === 'no')  ? '\u2612' : '\u2610';
    body.replaceText('\\{\\{Q' + n + '_YESBOX\\}\\}', yesG);
    body.replaceText('\\{\\{Q' + n + '_NOBOX\\}\\}',  noG);
  });

  // The master template highlights unfilled tokens in yellow so they're easy
  // to spot when editing — strip that (and any stray color) from the filled copy.
  var text = body.editAsText();
  if (text.getText().length) {
    text.setBackgroundColor(0, text.getText().length - 1, null);
  }

  doc.saveAndClose();

  var pdfBlob = DriveApp.getFileById(copyFile.getId()).getAs(MimeType.PDF);
  var pdfFile = folder.createFile(pdfBlob).setName(baseName + '.pdf');
  DriveApp.getFileById(copyFile.getId()).setTrashed(true); // keep only the PDF, not the temp Doc

  // Replace this row's live PDF: trash whatever was previously generated for
  // this form instance so the folder doesn't accumulate old versions.
  var oldPdfUrl = rowObj[FORMS_PDF_URL_COL];
  if (oldPdfUrl) {
    var oldId = _extractDriveId(oldPdfUrl);
    if (oldId) {
      try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* already gone, ignore */ }
    }
  }

  var urlCol  = headers.indexOf(FORMS_PDF_URL_COL);
  var dateCol = headers.indexOf(FORMS_PDF_DATE_COL);
  if (urlCol  === -1) throw new Error('Forms sheet is missing a "' + FORMS_PDF_URL_COL + '" column');
  if (dateCol === -1) throw new Error('Forms sheet is missing a "' + FORMS_PDF_DATE_COL + '" column');
  sheet.getRange(rowIdx + 1, urlCol + 1).setValue(pdfFile.getUrl());
  sheet.getRange(rowIdx + 1, dateCol + 1).setValue(new Date());

  return {
    pdfUrl:  pdfFile.getUrl(),
    pdfId:   pdfFile.getId(),
    pdfBlob: pdfBlob,
    formName: rowObj['Form Name'] || '',
    school:   rowObj['School'] || ''
  };
}

function handleGenerateFormPdf(p) {
  var id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing form id' };
  try {
    var out = _generateFilledFormPdf(id);
    return { ok: true, pdfUrl: out.pdfUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function handleEmailFormPdf(p) {
  var id = String(p.id || '').trim();
  var to = String(p.to || '').trim();
  if (!id) return { ok: false, error: 'Missing form id' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: 'Invalid email address' };
  try {
    var out     = _generateFilledFormPdf(id);
    var subject = String(p.subject || (out.formName + (out.school ? ' — ' + out.school : '')) || 'Ranger Rover Form');
    var body    = String(p.message || 'Please see the attached form.');
    GmailApp.sendEmail(to, subject, body, { attachments: [out.pdfBlob] });
    return { ok: true, pdfUrl: out.pdfUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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



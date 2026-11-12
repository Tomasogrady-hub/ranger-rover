/**
 * Ranger Rover — "Tokens" sidebar for Google Docs (works like Mail Merge's side panel)
 *
 * SETUP (once per template doc):
 *  1. Open the Google Doc → Extensions → Apps Script.
 *  2. Delete the sample code, paste this whole file, click Save.
 *  3. Close the script tab and reload the Doc. A new menu "Ranger Rover" appears.
 *     First use asks you to authorize (it reads the Ranger Rover sheet).
 *  4. Ranger Rover → Tokens… opens the side panel. Click in the doc, then click
 *     "Insert" next to a value — the token is typed at your cursor.
 *
 * TIP: build one template doc this way, then File → Make a copy for new docs —
 * the sidebar script is copied along with it.
 */
var SITES_SHEET_ID = '1fs9T_fhevN-6_NgaDV941-RaQMC5mF52yc8eDitgsJc'; // Ranger Rover sheet

function onOpen() {
  DocumentApp.getUi().createMenu('Ranger Rover').addItem('Tokens…', 'showTokenSidebar').addToUi();
}

function showTokenSidebar() {
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    'body{font:13px Arial,sans-serif;margin:10px;color:#222}' +
    'input{width:100%;box-sizing:border-box;padding:7px;margin:6px 0 8px;font-size:13px}' +
    '.row{border-bottom:1px solid #e4e4e4;padding:6px 0}.nm{font-weight:bold}' +
    '.val{color:#666;margin:2px 0}.b{margin:2px 4px 0 0;padding:4px 8px;font-size:12px;cursor:pointer}' +
    'h4{margin:12px 0 2px}.msg{color:#188038;min-height:16px;font-size:12px}' +
    '</style>' +
    '<b>Click in the doc, then press Insert.</b><div class="msg" id="msg"></div>' +
    '<h4>Schools &amp; date</h4><div id="fixed"></div>' +
    '<h4>Items</h4><input id="q" type="search" placeholder="Search items…" oninput="draw()">' +
    '<div id="list">Loading…</div>' +
    '<script>' +
    'var ITEMS=[];' +
    'function ins(t){google.script.run.withSuccessHandler(function(){document.getElementById("msg").textContent="Inserted "+t}).withFailureHandler(function(e){document.getElementById("msg").textContent=e.message}).insertToken(t)}' +
    'function btn(l,t){return "<button class=b data-t=\\""+t.replace(/\\"/g,"&quot;")+"\\" onclick=ins(this.dataset.t)>"+l+"</button>"}' +
    'function money(v){var n=parseFloat(v);return isNaN(n)?"":"$"+n.toFixed(2)}' +
    'function draw(){var q=document.getElementById("q").value.toLowerCase();var h="";' +
    'ITEMS.filter(function(i){return !q||i.name.toLowerCase().indexOf(q)>-1}).slice(0,40).forEach(function(i){' +
    'h+="<div class=row><div class=nm>"+i.name.replace(/</g,"&lt;")+"</div><div class=val>"+(money(i.amount)||"no amount")+(money(i.fullDay)?" · full day "+money(i.fullDay):"")+"</div>"+' +
    'btn("Price","{{item:"+i.id+"}}")+btn("Price .00","{{item:"+i.id+".amount.00}}")+(money(i.fullDay)?btn("Full day","{{item:"+i.id+".fullday}}")+btn("Full day .00","{{item:"+i.id+".fullday.00}}"):"")+btn("Name","{{item:"+i.id+".name}}")+"</div>"});' +
    'document.getElementById("list").innerHTML=h||"No items match."}' +
    'document.getElementById("fixed").innerHTML=btn("Active school count","{{sites.count}}")+btn("School names (list)","{{sites.list}}")+btn("School names (lines)","{{sites.lines}}")+btn("Today","{{today}}");' +
    'google.script.run.withSuccessHandler(function(d){ITEMS=d;draw()}).withFailureHandler(function(e){document.getElementById("list").textContent=e.message}).getTokenItems();' +
    '</script>'
  ).setTitle('Ranger Rover tokens');
  DocumentApp.getUi().showSidebar(html);
}

function getTokenItems() {
  var sh = SpreadsheetApp.openById(SITES_SHEET_ID).getSheetByName('Items All');
  var d = sh.getDataRange().getValues(), h = d[0];
  var idi = h.indexOf('ID'), ni = h.indexOf('Name'), ai = h.indexOf('Amount'), fi = h.indexOf('Full day Amount');
  var out = [];
  for (var r = 1; r < d.length; r++) {
    if (!d[r][idi] || !d[r][ni]) continue;
    out.push({ id: String(d[r][idi]).trim(), name: String(d[r][ni]).trim(), amount: d[r][ai], fullDay: fi > -1 ? d[r][fi] : '' });
  }
  out.sort(function(a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  return out;
}

function insertToken(text) {
  var doc = DocumentApp.getActiveDocument(), sel = doc.getSelection();
  if (sel) {
    var els = sel.getRangeElements();
    if (els.length === 1 && els[0].getElement().editAsText) {
      var t = els[0].getElement().editAsText();
      if (els[0].isPartial()) { t.deleteText(els[0].getStartOffset(), els[0].getEndOffsetInclusive()); t.insertText(els[0].getStartOffset(), text); return; }
    }
  }
  var cur = doc.getCursor();
  if (!cur) throw new Error('Click in the document where the token should go.');
  cur.insertText(text);
}

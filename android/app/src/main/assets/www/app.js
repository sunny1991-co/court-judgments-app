// Court Judgments — search UI. All data comes through the native cache proxy (/data?u=...).
"use strict";
const DATA = "https://github.com/sunny1991-co/court-judgments-app/releases/download/data-latest/";
const SC_PDF = "https://indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/";
const HC_PDF = "https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/";
const PAGE = 60;
const cache = {};
let manifest = null, results = [], shown = 0, fresh = false;
const N = window.Native || { openPdf: u => window.open(u), download: u => window.open(u), share: () => {}, clearCache: () => {} };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJSON(name) {
  if (cache[name] && !fresh) return cache[name];
  const r = await fetch("/data?u=" + encodeURIComponent(DATA + name) + (fresh ? "&fresh=1" : ""));
  if (!r.ok) throw new Error("download fail " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  cache[name] = j;
  return j;
}

async function getManifest() {
  if (!manifest || fresh) manifest = await getJSON("manifest.json");
  return manifest;
}

// --- search: every word must appear somewhere in the row (case-insensitive) ---
function norm(s) { return String(s || "").toLowerCase().replace(/[.,/()\-_:]/g, " ").replace(/\s+/g, " "); }
// Search: every word must match. English words: substring. Hindi words: legal
// dictionary (any English synonym) or sound-match of the transliterated word.
function itemSkel(it) {
  if (it.skel === undefined) it.skel = " " + it.text.split(" ").map(HINDI.skel).join(" ") + " ";
  return it.skel;
}
function matcher(q) {
  const parts = HINDI.words(q).map(p => {
    if (p.plain !== undefined) { const w = norm(p.plain).trim(); return it => !w || it.text.includes(w); }
    if (p.any) { const alts = p.any.map(norm); return it => alts.some(a => it.text.includes(a)); }
    return it => !p.sk || itemSkel(it).includes(" " + p.sk + " ");
  });
  return it => parts.every(f => f(it));
}
function hlWords(q) {
  const out = [];
  HINDI.words(q).forEach(p => {
    if (p.plain !== undefined) out.push(...norm(p.plain).split(" "));
    else if (p.any) out.push(...p.any);
    else if (p.latin) out.push(p.latin.replace(/aa/g, "a"));
  });
  return out.filter(w => w && w.length > 1);
}
function highlight(text, q) {
  let out = esc(text);
  hlWords(q).forEach(w => {
    out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
  });
  return out;
}

function status(msg) { const el = $("#status"); if (el) el.innerHTML = msg; }
function busy(msg) { status("⏳ " + msg); }

// --- saved list (on this phone only) ---
function saved() { try { return JSON.parse(localStorage.getItem("saved") || "[]"); } catch (e) { return []; } }
function setSaved(list) { try { localStorage.setItem("saved", JSON.stringify(list)); } catch (e) {} }
function isSaved(id) { return saved().some(x => x.id === id); }
function toggleSave(item) {
  let list = saved();
  if (list.some(x => x.id === item.id)) list = list.filter(x => x.id !== item.id);
  else list.unshift(item);
  setSaved(list.slice(0, 500));
}

// --- result rendering ---
function card(item, q) {
  const tags = [item.court, item.date, item.disposal].filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join("");
  const star = isSaved(item.id) ? "★ Saved" : "☆ Save";
  return `<article class="card" data-id="${esc(item.id)}">
    <h3>${highlight(item.title, q)}</h3>
    <div>${tags}</div>
    ${item.judge ? `<p class="meta">👨‍⚖️ ${highlight(item.judge, q)}</p>` : ""}
    ${item.extra ? `<p class="meta">${highlight(item.extra, q)}</p>` : ""}
    ${item.desc ? `<p class="desc">${highlight(item.desc, q)}</p>` : ""}
    <div class="actions">
      ${item.pdf ? `<button class="btn primary" data-act="open">📄 PDF kholo</button>
      <button class="btn" data-act="dl">⬇️ Download</button>` : `<span class="meta">PDF uplabdh nahi</span>`}
      ${item.cnr ? `<button class="btn" data-act="official">✔️ Official check</button>` : ""}
      <button class="btn" data-act="save">${star}</button>
      <button class="btn" data-act="share">↗️</button>
    </div></article>`;
}

function render(q) {
  const box = $("#results");
  if (!results.length) { box.innerHTML = `<p class="empty">Kuch nahi mila. Doosre shabd ya saal try karo.</p>`; return; }
  box.innerHTML = results.slice(0, shown).map(r => card(r, q)).join("") +
    (shown < results.length ? `<button class="btn more" id="more">Aur dikhao (${results.length - shown} baaki)</button>` : "");
  const more = $("#more");
  if (more) more.onclick = () => { shown += PAGE; render(q); };
}

$("#view").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const id = b.closest(".card").dataset.id;
  const item = results.find(r => r.id === id) || saved().find(r => r.id === id);
  if (!item) return;
  const act = b.dataset.act;
  if (act === "open") N.openPdf(item.pdf);
  if (act === "dl") N.download(item.pdf, (item.fileName || item.title).slice(0, 80));
  if (act === "official") {
    // Cross-check on the court's own site: CNR is copied, the official search page opens.
    const url = item.id.startsWith("sc:") ? "https://www.sci.gov.in/judgements-case-no/"
      : "https://services.ecourts.gov.in/ecourtindia_v6/";
    if (N.openOfficial) N.openOfficial(url, item.cnr);
  }
  if (act === "share") N.share(`${item.title}\n${item.court} · ${item.date}\n${item.pdf || ""}`);
  if (act === "save") { toggleSave(item); b.textContent = isSaved(item.id) ? "★ Saved" : "☆ Save"; }
});

// --- Supreme Court ---
function scItem(r) {
  const [title, pet, res, judge, cit, caseId, cnr, date, disp, desc, path, year] = r;
  return {
    id: "sc:" + (cnr || path), court: "Supreme Court", title: title || `${pet} vs ${res}`,
    date, disposal: disp, judge, desc,
    extra: [caseId, cit, cnr].filter(Boolean).join(" · "),
    cnr: cnr || "",
    pdf: path ? `${SC_PDF}year=${year}/english/${path}_EN.pdf` : "",
    fileName: `SC_${date}_${(caseId || cnr || path).replace(/\s+/g, "")}`,
    text: norm([title, pet, res, judge, cit, caseId, cnr, desc, disp].join(" ")),
  };
}

async function showSC() {
  $("#view").innerHTML = $("#tpl-sc").innerHTML;
  const m = await getManifest().catch(() => null);
  const [y0, y1] = (m && m.sc && m.sc.years.length) ? m.sc.years : [1950, new Date().getFullYear()];
  const opts = (sel) => { for (let y = y1; y >= y0; y--) sel.insertAdjacentHTML("beforeend", `<option>${y}</option>`); };
  const from = $("#from"), to = $("#to");
  from.insertAdjacentHTML("beforeend", `<option value="${y0}">Se: ${y0}</option>`); opts(from);
  to.insertAdjacentHTML("beforeend", `<option value="${y1}">Tak: ${y1}</option>`); opts(to);
  if (m) status(`Supreme Court: ${m.sc.count.toLocaleString("en-IN")} judgments · data ${m.updated_utc.slice(0, 10)}`);
  const run = async () => {
    const q = $("#q").value.trim();
    busy("Supreme Court data khul raha hai… (pehli baar thoda time)");
    let data;
    try { data = await getJSON(m ? m.sc.file : "sc.json.gz"); } catch (e) { status("❌ Data download nahi hua. Internet check karo."); return; }
    if (!data.items) data.items = data.rows.map(scItem);
    const a = Math.min(+from.value, +to.value), b = Math.max(+from.value, +to.value);
    const ok = q ? matcher(q) : () => true;
    results = data.items.filter(it => { const y = +it.date.slice(0, 4); return y >= a && y <= b && ok(it); });
    shown = PAGE;
    status(`${results.length.toLocaleString("en-IN")} judgments mile` + (q ? ` "${esc(q)}" ke liye` : ""));
    render(q);
  };
  $("#go").onclick = run;
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
}

// --- High Courts ---
function hcItem(r, court) {
  const [title, judge, cnr, date, disp, desc, bench, file, year] = r;
  return {
    id: "hc:" + (cnr || file) + ":" + date, court: court.name, title, date, disposal: disp, judge, desc,
    extra: [cnr, bench].filter(Boolean).join(" · "),
    cnr: cnr || "",
    pdf: file ? `${HC_PDF}year=${year}/court=${court.code}/bench=${bench}/${file}` : "",
    fileName: `${court.code}_${date}_${cnr || file}`,
    text: norm([title, judge, cnr, desc, disp].join(" ")),
  };
}

async function showHC() {
  $("#view").innerHTML = $("#tpl-hc").innerHTML;
  busy("Courts ki list aa rahi hai…");
  let m;
  try { m = await getManifest(); } catch (e) { status("❌ List download nahi hui. Internet check karo."); return; }
  const court = $("#court"), year = $("#year");
  court.innerHTML = m.hc.map((c, i) => `<option value="${i}">${esc(c.name)} (${c.shards.reduce((s, x) => s + x.count, 0).toLocaleString("en-IN")})</option>`).join("");
  const fillYears = () => {
    const c = m.hc[+court.value];
    year.innerHTML = c.shards.map((s, i) => `<option value="${i}">${esc(s.label)} — ${s.count.toLocaleString("en-IN")} judgments (${(s.bytes / 1e6).toFixed(1)} MB)</option>`).join("");
  };
  court.onchange = fillYears; fillYears();
  status(`${m.hc.length} High Courts · ${(m.hc_count || 0).toLocaleString("en-IN")} judgments · data ${m.updated_utc.slice(0, 10)}`);
  const run = async () => {
    const c = m.hc[+court.value], s = c.shards[+year.value], q = $("#q").value.trim();
    busy(`${esc(c.name)} ${esc(s.label)} ka data khul raha hai… (${(s.bytes / 1e6).toFixed(1)} MB)`);
    const ok = q ? matcher(q) : () => true;
    results = [];
    // Big years come in parts: open one part at a time, keep only matches (saves phone memory).
    for (let k = 0; k < s.files.length; k++) {
      if (s.files.length > 1) busy(`${esc(c.name)} ${esc(s.label)} — hissa ${k + 1}/${s.files.length}…`);
      let data;
      try { data = await getJSON(s.files[k]); } catch (e) { status("❌ Data download nahi hua. Internet check karo."); return; }
      for (const r of data.rows) { const it = hcItem(r, c); if (ok(it)) results.push(it); }
      if (s.files.length > 1) delete cache[s.files[k]];
    }
    shown = PAGE;
    status(`${results.length.toLocaleString("en-IN")} judgments mile — ${esc(c.name)}, ${esc(s.label)}` + (q ? ` · "${esc(q)}"` : ""));
    render(q);
  };
  $("#go").onclick = run;
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
}

// --- Saved ---
function showSaved() {
  $("#view").innerHTML = $("#tpl-saved").innerHTML;
  results = saved(); shown = results.length;
  status(results.length ? `⭐ ${results.length} saved judgments (sirf is phone pe)` : "Abhi kuch saved nahi. Kisi judgment pe ☆ Save dabao.");
  if (results.length) render(""); else $("#results").innerHTML = "";
}

function route() {
  const tab = (location.hash || "#sc").slice(1);
  document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  results = []; shown = 0;
  if (tab === "hc") showHC(); else if (tab === "saved") showSaved(); else showSC();
}

$("#refresh").onclick = () => {
  N.clearCache(); Object.keys(cache).forEach(k => delete cache[k]); manifest = null;
  fresh = true; setTimeout(() => { fresh = false; }, 60000);
  route();
};
window.addEventListener("hashchange", route);
route();

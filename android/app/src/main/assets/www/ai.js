// 🈯 Judgment ka saransh ya poora anuvaad — Hindi / dusri bhashaon mein.
// Google Gemini (free) with the user's OWN key, kept only on this phone.
// AI galti kar sakta hai: court mein asli English judgment hi maanya hai.
"use strict";
const AI = (() => {
  const API = "https://generativelanguage.googleapis.com/v1beta/";
  const LANGS = ["Hindi", "English (aasaan)", "Marathi", "Gujarati", "Punjabi", "Bengali", "Odia", "Assamese", "Urdu", "Tamil", "Telugu", "Kannada", "Malayalam"];
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full */ } } };
  const key = () => ls.get("aiKey", "");

  const wait = {};
  window.NativeCb = (id, d) => { const f = wait[id]; if (f) { delete wait[id]; f(d); } };
  const ncall = (fn, ...a) => new Promise(res => { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); wait[id] = res; N[fn](id, ...a); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function http(path, body) {
    if (N.aiPost) { const r = await ncall("aiPost", API + path, key(), body ? JSON.stringify(body) : ""); return r; }
    try {
      const res = await fetch(API + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-goog-api-key": key() }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, text: await res.text() };
    } catch (e) { return { status: 0, text: "" }; }
  }
  function friendly(st, raw) {
    if (st === 0) return "Internet nahi mila";
    if (/API_KEY_INVALID|API key not valid/i.test(raw)) return "AI key galat hai — 🔑 dobara daalo";
    if (st === 429) return /PerDay|per day/i.test(raw) ? "Aaj ki free AI limit khatam — kal try karo" : "Free limit thodi der ke liye poori — 1 minute baad";
    if (st >= 500) return "Google ka server busy hai — thodi der baad";
    return "AI se jawab nahi aaya (" + st + ")";
  }

  async function models() {
    try { const c = JSON.parse(ls.get("aiModels", "null")); if (c && Date.now() - c.at < 3 * 86400000) return c.list; } catch (e) { /* refresh */ }
    const r = await http("models?pageSize=200");
    if (r.status !== 200) throw new Error(friendly(r.status, r.text));
    const names = (JSON.parse(r.text).models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace(/^models\//, ""));
    const bad = /(preview|exp|tts|image|live|audio|embed|robotic|computer|native|-\d{3}$)/i;
    const ver = n => parseFloat((n.match(/^gemini-([\d.]+)-flash/) || [0, -1])[1]);
    const flash = names.filter(n => !bad.test(n) && /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const lite = names.filter(n => !bad.test(n) && /^gemini-[\d.]+-flash-lite$/.test(n)).sort((a, b) => ver(b) - ver(a));
    const list = [...new Set([...flash, ...lite, ...(names.includes("gemini-flash-latest") ? ["gemini-flash-latest"] : [])])].slice(0, 5);
    if (!list.length) throw new Error("Is key pe koi Gemini model nahi mila");
    ls.set("aiModels", JSON.stringify({ at: Date.now(), list }));
    return list;
  }

  // one answer (not streamed); busy -> retry, then next model
  async function generate(parts, system, stop) {
    const list = await models();
    let last = "";
    for (const m of list) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (stop && stop.stop) throw new Error("⏹ Roka gaya");
        const gc = { temperature: 0.3 };
        if (!ls.get("noFast." + m, "")) { if (/^gemini-2\.5-flash/.test(m)) gc.thinkingConfig = { thinkingBudget: 0 }; else if (/^gemini-[3-9]/.test(m)) gc.thinkingConfig = { thinkingLevel: "low" }; }
        const r = await http("models/" + m + ":generateContent", { system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }], generationConfig: gc });
        if (r.status === 200) {
          const j = JSON.parse(r.text);
          const c = (j.candidates || [])[0] || {};
          const t = ((c.content || {}).parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");
          if (t) return t;
          last = "AI ne khaali jawab diya" + (c.finishReason ? " (" + c.finishReason + ")" : "");
          break;
        }
        if (r.status === 400 && /thinking/i.test(r.text)) { ls.set("noFast." + m, "1"); continue; }
        last = friendly(r.status, r.text);
        if (r.status === 0 || /API_KEY_INVALID/.test(r.text)) throw new Error(last);
        if (r.status >= 500 && attempt === 0) { await sleep(1500); continue; }
        if (r.status === 404) ls.set("aiModels", "");
        break; // 429 / other: next model
      }
    }
    throw new Error(last || "AI se jawab nahi aaya");
  }

  async function pdf(url) {
    if (N.fetchPdf) { const r = await ncall("fetchPdf", url); if (r.error) throw new Error("PDF nahi aayi: " + r.error); return r.b64; }
    const res = await fetch(url); if (!res.ok) throw new Error("PDF nahi aayi");
    const b = new Uint8Array(await res.arrayBuffer()); let s = "";
    for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    return btoa(s);
  }

  // ---------- screens ----------
  function overlay(html) {
    let o = $("#aio");
    if (!o) { o = document.createElement("div"); o.id = "aio"; o.className = "aio"; document.body.appendChild(o); }
    o.innerHTML = `<div class="aio-in">${html}</div>`;
    o.hidden = false;
    return o;
  }
  function close() { const o = $("#aio"); if (o) { o.hidden = true; o.innerHTML = ""; } if (job) job.stop = true; }
  let job = null;

  function keyScreen(then) {
    const o = overlay(`<h3>🔑 AI key (free) — ek baar</h3>
      <ol class="meta"><li><a href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a> kholo, Gmail se login</li>
      <li><b>Create API key</b> → copy</li><li>Yahan paste karke Save</li></ol>
      <p class="meta">Sahayak app wali key bhi yahan chal jayegi. Key sirf is phone mein rehti hai — kisi ko mat bhejna.</p>
      <input id="aik" class="search" type="password" placeholder="AIza…" autocomplete="off">
      <div class="row" style="margin-top:8px"><button class="btn primary" id="aiks">💾 Save</button><button class="btn" id="aix">Band</button></div>
      <p class="meta" id="aikm"></p>`);
    $("#aix").onclick = close;
    $("#aiks").onclick = async () => {
      const v = $("#aik").value.replace(/[\s"'`]/g, "");
      if (v.length < 20) { $("#aikm").textContent = "Poori key paste karo"; return; }
      ls.set("aiKey", v); ls.set("aiModels", "");
      $("#aikm").textContent = "⏳ Check ho rahi hai…";
      try { await models(); then(); } catch (e) { $("#aikm").textContent = "❌ " + e.message; }
    };
  }

  function open(item) {
    if (!key()) { keyScreen(() => open(item)); return; }
    const lastLang = ls.get("aiLang", "Hindi");
    const o = overlay(`<h3>🈯 ${esc(item.title)}</h3><p class="meta">${esc([item.court, item.date].filter(Boolean).join(" · "))}</p>
      <label class="meta">Bhasha</label>
      <select id="ail">${LANGS.map(l => `<option ${l === lastLang ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="ai1">📝 Poora saransh</button><button class="btn" id="ai2">📄 Poori PDF ka anuvaad</button></div>
      <p class="meta">Saransh: ek baar mein (~30 sec). Anuvaad: 3-3 page karke — lambi PDF mein kai minute. AI galti kar sakta hai; court mein asli English judgment hi maanya hai.</p>
      <div class="row"><button class="btn" id="aix">Band</button><button class="link" id="aikey">🔑 Key badlo</button></div>`);
    $("#aix").onclick = close;
    $("#aikey").onclick = () => keyScreen(() => open(item));
    $("#ai1").onclick = () => { ls.set("aiLang", $("#ail").value); run(item, $("#ail").value, 1); };
    $("#ai2").onclick = () => { ls.set("aiLang", $("#ail").value); run(item, $("#ail").value, 2); };
  }

  async function run(item, lang, mode) {
    const ck = "ai:" + mode + ":" + lang + ":" + item.id;
    const title = (mode === 1 ? "📝 Saransh" : "📄 Anuvaad") + " — " + lang;
    const o = overlay(`<div class="row" style="justify-content:space-between"><b>${title}</b><button class="btn" id="aix">✕</button></div>
      <p class="meta">${esc(item.title)}</p>
      <div id="aiprog" class="meta"></div><div id="aiout" class="aiout"></div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn" id="aistop">⏹ Roko</button><button class="btn primary" id="aisave" hidden>⬇️ Save</button><button class="btn" id="aish" hidden>↗️ Share</button><button class="btn" id="aire" hidden>🔁 Dobara banao</button></div>`);
    let text = "";
    const show = (t, prog) => { $("#aiout").innerHTML = MD.render(t); if (prog != null) $("#aiprog").innerHTML = prog; };
    const finish = note => {
      $("#aistop").hidden = true; ["#aisave", "#aish", "#aire"].forEach(s => { $(s).hidden = !text; });
      $("#aiprog").textContent = note || "";
    };
    $("#aix").onclick = close;
    $("#aistop").onclick = () => { if (job) job.stop = true; };
    $("#aish").onclick = () => N.share(item.title + "\n" + title + "\n\n" + text);
    $("#aisave").onclick = async () => {
      const name = (item.fileName || "judgment") + "_" + (mode === 1 ? "saransh" : "anuvaad") + "_" + lang.split(" ")[0] + ".txt";
      const body = item.title + "\n" + [item.court, item.date].join(" · ") + "\n" + title + "\n(AI se bana — asli judgment se milaan karein)\n\n" + text;
      if (N.saveText) { const r = await ncall("saveText", name, body); status(r.ok ? "✅ Save: Downloads/Judgments/" + name : "Save nahi hua"); $("#aiprog").textContent = r.ok ? "✅ Save: Downloads/Judgments/" + name : "Save nahi hua"; }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" })); a.download = name; a.click(); }
    };
    $("#aire").onclick = () => { ls.set(ck, ""); run(item, lang, mode); };
    const cached = ls.get(ck, "");
    if (cached) { text = cached; show(text); finish("📦 Pehle bana hua (phone mein save)"); return; }

    job = { stop: false };
    const my = job;
    const dots = m => `<span class="dots"><i></i><i></i><i></i></span> ${m}`;
    try {
      show("", dots("PDF aa rahi hai…"));
      const b64 = await pdf(item.pdf);
      const file = { inline_data: { mime_type: "application/pdf", data: b64 } };
      if (mode === 1) {
        show("", dots("Saransh ban raha hai…"));
        text = await generate([file, { text: `Ye court judgment hai. Iska POORA saransh ${lang} mein do, aasaan bhasha mein, in headings ke saath:\n1. Case: naam, court, tareekh, judge\n2. Paksh: kaun kiske khilaaf\n3. Mamla kya tha (tathya)\n4. Mukhya kanooni sawaal\n5. Dono paksh ki daleel\n6. Court ka tark\n7. Faisla — kya hua (final order)\n8. Dharayein aur purane faisle jinka zikr hai\n9. Ek line mein: is faisle ka matlab\nJo judgment mein nahi likha, wo apni taraf se mat jodo. Kanooni shabd ke saath bracket mein English term likho.` }],
          "Tum ek anubhavi kanooni sahayak ho. Sirf judgment mein likhi baat ka saar dete ho.", my);
        show(text);
      } else {
        const STEP = 3, END = "[[KHATAM]]";
        for (let i = 0; i < 100; i++) {
          if (my.stop) throw new Error("⏹ Roka gaya — ab tak ka anuvaad upar hai");
          const a = i * STEP + 1, z = a + STEP - 1;
          show(text, dots(`Page ${a}–${z} ka anuvaad…`));
          const t = (await generate([file, { text: `Is PDF ke page ${a} se ${z} tak ka POORA, line-by-line ${lang} anuvaad karo — saransh nahi, poora text. Naam, case number, dharayein (sections), tareekhein aur rakam jaisi hain waisi rakho; kanooni shabd ke saath bracket mein English shabd likho. Sirf anuvaad likho, koi bhoomika nahi. Har page se pehle "### Page N" likho. Agar page ${a} PDF mein hai hi nahi, to sirf ${END} likho. Agar PDF ka aakhri page in pages mein aa gaya, to ant mein ${END} likho.` }],
            "Tum ek kushal kanooni anuvaadak ho. Sirf diye gaye pages ka sahi anuvaad karte ho, apni taraf se kuch nahi jodte.", my)).trim();
          const clean = t.replace(END, "").trim();
          if (clean) { text += (text ? "\n\n" : "") + clean; show(text); }
          if (t.includes(END) || !clean) break;
          await sleep(1200);
        }
      }
      if (text) ls.set(ck, text.slice(0, 400000));
      finish(text ? "✅ Ho gaya" : "Kuch nahi bana");
    } catch (e) {
      finish("⚠️ " + (e.message || "Gadbad hui") + (text ? " — ab tak ka upar hai" : ""));
    }
  }

  // Android back button closes this popup first
  window.aiBack = () => { const o = $("#aio"); if (o && !o.hidden) { close(); return true; } return false; };
  return { open };
})();

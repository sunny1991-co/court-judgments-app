// Tiny, safe Markdown -> HTML (text is escaped first; only http(s) links).
"use strict";
const MD = (() => {
  function inline(s) {
    s = esc(s);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>");
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => p + '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[+i] + "</code>");
  }
  function table(lines) {
    const rows = lines.filter(l => !/^\s*\|?\s*:?-{2,}/.test(l)).map(l => l.replace(/^\s*\||\|\s*$/g, "").split("|"));
    return "<table>" + rows.map((r, i) => "<tr>" + r.map(c => (i ? "<td>" : "<th>") + inline(c.trim()) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table>";
  }
  function render(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    let out = "", i = 0, para = [];
    const flush = () => { if (para.length) { out += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        flush(); const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>"; continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flush(); const buf = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) buf.push(lines[i++]);
        out += table(buf); continue;
      }
      let m = l.match(/^(#{1,4})\s+(.*)$/);
      if (m) { flush(); out += "<h" + (m[1].length + 1) + ">" + inline(m[2]) + "</h" + (m[1].length + 1) + ">"; i++; continue; }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
        flush(); const ordered = /^\s*\d/.test(l); const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")); i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items[items.length - 1] += " " + lines[i++].trim();
        }
        const tg = ordered ? "ol" : "ul";
        out += "<" + tg + ">" + items.map(t => "<li>" + inline(t) + "</li>").join("") + "</" + tg + ">"; continue;
      }
      if (/^\s*>\s?/.test(l)) { flush(); out += "<p class='muted'>" + inline(l.replace(/^\s*>\s?/, "")) + "</p>"; i++; continue; }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { flush(); out += "<hr>"; i++; continue; }
      if (!l.trim()) { flush(); i++; continue; }
      para.push(l); i++;
    }
    flush();
    return out;
  }
  // Plain text for reading aloud
  function plain(src) {
    return String(src || "").replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "")
      .replace(/[*_#>|~]+/g, " ").replace(/^\s*[-•]\s+/gm, "").replace(/[ \t]+/g, " ").trim();
  }
  return { render, plain };
})();

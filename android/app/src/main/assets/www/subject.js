// 📚 Vishay (subject) from the case type in the title + judgment words. A judgment can have more than one.
"use strict";
const SUBJECTS = [
  ["bail", "🔓 Zamanat (Bail)", /\bbail\b|anticipatory|zamanat|\b438\b|\b439\b|\b480\b|\b482 bnss|\b483\b/i],
  ["ndps", "💊 NDPS / nasha", /\bndps\b|narcotic|psychotropic/i],
  ["criminal", "⚖️ Criminal (appeal, revision, quashing)", /\bcrl\b|crl\.|criminal|\bcr\.?a\b|cr\.?rev|\b482\b|\b528\b|quash|\bipc\b|\bbns\b|murder|\b302\b|\b376\b|\b420\b|\b498/i],
  ["family", "👨‍👩‍👧 Pariwar / shaadi / gujara", /mat\.|matrimonial|divorce|family|maintenance|\b125\b|guardian|custody|hindu marriage|\bhma\b|domestic violence|dowry/i],
  ["property", "🏠 Zameen / property / civil", /\brfa\b|\brsa\b|\bfa\b|\bsa\b|second appeal|first appeal|regular (first|second)|civil revision|c\.r\.p|civil suit|\bcs\(os\)|\bo\.?s\.? no|cm\(m\)|civil misc|property|partition|eviction|\brent\b|tenant|possession|injunction|specific performance|land acquisition|mutation|revenue/i],
  ["service", "👷 Naukri / service / pension", /service matter|service law|service bench|writ ?- ?a\b|w\.p\.?\s*\(s\)|wp\(s\)|pension|appointment|promotion|dismissal from service|seniority|recruitment|regulari[sz]|disciplinary|constable|employee|employment|termination|retire|salary|pay scale|cadre|deputation|central administrative tribunal|\bcat\b|\bbsf\b|\bcrpf\b|\bcisf\b|\bitbp\b|armed forces/i],
  ["accident", "🚗 Accident / MACT", /\bmact\b|motor accident|m\.a\.c|motor vehicle|\bfao\b.*(compensation|accident)|claim tribunal/i],
  ["tax", "💰 Tax (income tax, GST)", /\bita\b|income ?tax|\bgst\b|\bvat\b|customs|excise|sales tax|service tax|\btax\b/i],
  ["company", "🏢 Company / commercial / arbitration", /comm\b|commercial|\barb\b|arb\.|arbitration|company|co\.? ?app|insolvency|\bibc\b|\bipd\b|trade ?mark|patent|copyright|cheque|\b138\b|negotiable/i],
  ["contempt", "🧾 Contempt (avmanana)", /\bcont\b|cont\.|contempt/i],
  ["labour", "🏭 Labour / industrial", /labour|labor|industrial|workm[ae]n|\bid act\b|\bepf\b|\besi\b/i],
  ["consumer", "🛒 Consumer", /consumer/i],
  ["election", "🗳️ Chunav (election)", /election|el\.? ?pet/i],
  ["education", "🎓 Shiksha / exam", /education|university|college|school|examination|\bneet\b|admission|students?\b/i],
  ["writ", "📜 Writ / sarkar ke khilaaf", /w\.p\.?|\bwp\b|writ|\bpil\b|public interest|\bl\.?p\.?a\b|letters patent/i],
];

function subjectsOf(it) {
  if (it._subj) return it._subj;
  const head = String(it.title || "") + " " + String(it.desc || "").slice(0, 400) + " " + String(it.extra || "");
  it._subj = SUBJECTS.filter(s => s[2].test(head)).map(s => s[0]);
  if (!it._subj.length) it._subj = ["other"];
  return it._subj;
}
const SUBJECT_NAME = Object.fromEntries(SUBJECTS.map(s => [s[0], s[1]]).concat([["other", "❔ Baaki"]]));

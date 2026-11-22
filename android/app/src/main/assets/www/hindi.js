// Hindi (Devanagari) search support: the judgment data is in English letters,
// so Hindi words are (1) looked up in a small legal-word dictionary, or
// (2) transliterated to English letters and matched by sound ("राम लाल" -> RAM LAL).
"use strict";
const HINDI = (() => {
  const V = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au" };
  const M = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o" };
  const C = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "rh", "फ़": "f", "ळ": "l",
  };
  const NUK = "़", VIRAMA = "्", ANUSVARA = "ं", CHANDRA = "ँ", VISARGA = "ः";
  const DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

  function translit(word) {
    let out = "", i = 0;
    const ch = [...word.normalize("NFC")];
    while (i < ch.length) {
      let c = ch[i];
      if (DIGITS[c]) { out += DIGITS[c]; i++; continue; }
      if (V[c]) { out += V[c]; i++; continue; }
      if (ch[i + 1] === NUK && C[c + NUK]) { c = c + NUK; i++; }
      if (C[c]) {
        out += C[c];
        const nx = ch[i + 1];
        if (nx === VIRAMA) { i += 2; continue; }
        if (M[nx]) { out += M[nx]; i += 2; continue; }
        out += "a"; i++; continue;
      }
      if (c === ANUSVARA || c === CHANDRA) { out += "n"; i++; continue; }
      if (c === VISARGA) { out += "h"; i++; continue; }
      out += c; i++;
    }
    // final inherent 'a' is usually silent in Hindi names: "राम" -> "ram"
    if (out.length > 2 && /[^aeiou]a$/.test(out) && !/aa$/.test(out)) out = out.slice(0, -1);
    return out;
  }

  // Sound key so spelling differences still match (Sharma/Sarma, Yadav/Jadav no; Prasad/Parsad yes).
  function skel(w) {
    return w.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/(.)\1+/g, "$1")
      .replace(/ph/g, "f").replace(/sh/g, "s").replace(/w/g, "v").replace(/z/g, "j")
      .replace(/kh/g, "k").replace(/gh/g, "g").replace(/chh?/g, "c").replace(/th/g, "t").replace(/dh/g, "d")
      .replace(/bh/g, "b").replace(/q/g, "k").replace(/ck/g, "k")
      .replace(/ng/g, "n").replace(/(?!^)h/g, "")   // सिंह / SINGH both -> "sn"
      .replace(/(?!^)[aeiouy]/g, "");
  }

  // Common legal words: Hindi -> English words used in judgments (any one may match).
  const DICT = {
    "जमानत": ["bail"], "अग्रिम": ["anticipatory"], "तलाक": ["divorce", "dissolution"], "विवाह": ["marriage"],
    "शादी": ["marriage"], "दहेज": ["dowry", "498a"], "हत्या": ["murder", "302"], "बलात्कार": ["rape", "376"],
    "चोरी": ["theft", "379"], "धोखाधड़ी": ["cheating", "420", "fraud"], "धोखा": ["cheating", "420", "fraud"],
    "अपहरण": ["kidnapping", "abduction"], "मारपीट": ["assault", "hurt", "323"], "भ्रष्टाचार": ["corruption"],
    "संपत्ति": ["property"], "सम्पत्ति": ["property"], "जमीन": ["land"], "भूमि": ["land"], "मकान": ["house", "premises"],
    "किराया": ["rent", "tenant", "tenancy"], "किरायेदार": ["tenant"], "बेदखली": ["eviction"], "वसीयत": ["will", "testament"],
    "बंटवारा": ["partition"], "उत्तराधिकार": ["succession", "inheritance"], "गुजारा": ["maintenance", "125"], "भत्ता": ["maintenance", "allowance"],
    "नौकरी": ["service", "employment", "appointment"], "सेवा": ["service"], "नियुक्ति": ["appointment"], "बर्खास्त": ["dismissal", "termination"],
    "पेंशन": ["pension"], "वेतन": ["salary", "pay"], "पदोन्नति": ["promotion"], "तबादला": ["transfer"], "स्थानांतरण": ["transfer"],
    "आरक्षण": ["reservation"], "मुआवजा": ["compensation"], "मुआवज़ा": ["compensation"], "दुर्घटना": ["accident", "mact"],
    "बीमा": ["insurance"], "चेक": ["cheque", "138", "negotiable"], "बैंक": ["bank"], "कर": ["tax"], "टैक्स": ["tax"],
    "जीएसटी": ["gst"], "आयकर": ["income tax"], "उपभोक्ता": ["consumer"], "बच्चा": ["child", "custody"], "अभिरक्षा": ["custody"],
    "हिरासत": ["custody"], "पुलिस": ["police"], "एफआईआर": ["fir"], "रद्द": ["quash", "quashing", "cancel"],
    "याचिका": ["petition"], "अपील": ["appeal"], "रिट": ["writ"], "जनहित": ["pil", "public interest"], "चुनाव": ["election"],
    "शिक्षा": ["education"], "परीक्षा": ["examination"], "विश्वविद्यालय": ["university"], "स्कूल": ["school"],
    "पर्यावरण": ["environment"], "वन": ["forest"], "खनन": ["mining"], "नशा": ["ndps", "narcotic"], "शराब": ["excise", "liquor"],
    "एससी": ["sc/st", "atrocities"], "अत्याचार": ["atrocities"], "घरेलू": ["domestic"], "हिंसा": ["violence"],
    "सरकार": ["state", "government", "union"], "राज्य": ["state"], "भारत": ["india", "union"], "संघ": ["union"],
    "बनाम": ["vs", "versus"], "न्यायाधीश": ["justice", "judge"], "आदेश": ["order"], "निर्णय": ["judgment"],
  };

  const isDeva = s => /[ऀ-ॿ]/.test(s);

  // Build matcher pieces for a query: each word -> {any:[english words]} or {sk: sound key}
  function words(q) {
    return q.split(/\s+/).filter(Boolean).map(w => {
      if (!isDeva(w)) return { plain: w.toLowerCase() };
      if (DICT[w]) return { any: DICT[w], label: w };
      const t = translit(w);
      return { sk: skel(t), latin: t, label: w };
    });
  }

  return { isDeva, translit, skel, words };
})();

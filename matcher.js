// Matches what you bought (store receipts) to rebate offers (Ibotta).
//
// Ibotta pays only for the products an offer lists, so a brand match isn't
// enough: "Oikos Triple Zero Greek Yogurt" covers four flavours in 4-count
// packs, not the plain 32 oz tub. Each offer's `terms` usually lists what's
// included ("• Vanilla, 4 ct"); `description` may limit the size ("32 oz
// only", "7 oz or larger"). An item is:
//   exact    the product, variety and size are all on the offer's list,
//   possible the product matches but the variety or size can't be confirmed
//            (shown for the user to check, never added automatically).
// Receipt names are short and shouty ("DANNON OIKOS TRIPLE ZERO PLAIN TUB
// 32OZ", "CHOC CHP"), so words match loosely: known abbreviations expand,
// plurals fold, and a word matches another that starts with it ("choc" →
// "chocolate"), which works as a wildcard.

const ABBREV = {
  choc: "chocolate", chp: "chip", chps: "chip", chkn: "chicken", chk: "chicken", bnls: "boneless",
  sknls: "skinless", org: "organic", orgnc: "organic", ygrt: "yogurt", yog: "yogurt", grk: "greek",
  van: "vanilla", strw: "strawberry", straw: "strawberry", bluebry: "blueberry", rasp: "raspberry",
  pnt: "peanut", pb: "peanut butter", btr: "butter", bttr: "butter", chs: "cheese", chz: "cheese",
  shrd: "shredded", shred: "shredded", mozz: "mozzarella", ched: "cheddar", parm: "parmesan",
  crm: "cream", wht: "white", whl: "whole", wb: "whole bean", grnd: "ground", gr: "ground",
  bf: "beef", trky: "turkey", tky: "turkey", sauc: "sauce", ssnng: "seasoning", ssn: "seasoning",
  mix: "mix", veg: "vegetable", vgtbl: "vegetable", frz: "frozen", frzn: "frozen", ref: "refrigerated",
  bev: "beverage", drnk: "drink", jce: "juice", wtr: "water", spklg: "sparkling", sprklng: "sparkling",
  crckr: "cracker", ckie: "cookie", ckies: "cookie", cerl: "cereal", tort: "tortilla", torts: "tortilla",
  bkd: "baked", unswt: "unsweetened", swt: "sweet", lt: "light", lite: "light", ff: "fat free",
  rf: "reduced fat", lf: "low fat", ls: "low sodium", gf: "gluten free", dz: "dozen",
  mr: "mister", tp: "toilet paper", pt: "paper towel", det: "detergent", dtrgnt: "detergent",
  orig: "original", nat: "natural", inst: "instant", almd: "almond", alm: "almond", cinn: "cinnamon",
  carml: "caramel", hny: "honey", lem: "lemon", swss: "swiss", amer: "american", ital: "italian",
  mex: "mexican", rst: "roast", rstd: "roasted", slcd: "sliced", slc: "slice", dcd: "dice",
  crshd: "crushed", strwbry: "strawberry",
  dannon: "dannon", oikos: "oikos",
};

// Words that say nothing about which product it is.
const NOISE = new Set([
  "the", "and", "with", "for", "any", "only", "see", "offer", "details", "select", "selected",
  "variety", "varieties", "size", "sizes", "product", "products", "item", "items", "pack", "pk",
  "count", "ct", "oz", "fl", "lb", "lbs", "g", "ml", "each", "ea", "new", "tub", "btl", "bottle",
  "box", "bag", "can", "jar", "multi", "billing", "family", "value", "single", "serve", "cup",
  "includes", "following", "valid", "purchase", "excludes", "or", "larger", "smaller", "of",
]);

// Store brands never have manufacturer rebates; the name alone tells you.
const STORE_BRANDS = /^(signature|lucerne|o organics|open nature|overjoyed|waterfront bistro|value corner|primo taglio|ready meals|kroger|simple truth|private selection|great value|market pantry|good & gather|h-e-b|hill country fare|member's mark|kirkland|wellsley farms)\b/i;

const singular = (w) => (w.length > 4 && /ies$/.test(w) ? w.slice(0, -3) + "y"
  : w.length > 4 && /(ches|shes|sses|xes|oes)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);

export function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[®™'’]/g, "")
    .replace(/&/g, " and ")
    .replace(/(\d)([a-z])/g, "$1 $2") // "32oz" → "32 oz"
    .split(/[^a-z0-9.%]+/)
    .flatMap((w) => (ABBREV[w] || w).split(" "))
    .map(singular)
    .filter((w) => w && !/^[\d.%]+$/.test(w) && !NOISE.has(w));
}

// One word matches another when one is a receipt truncation of the other (at
// least 4 letters), excluding full words that are prefixes of unrelated foods
// ("grape" vs "grapefruit", "butter" vs "buttermilk", "pro" vs "protein").
const DISTINCT_WORDS = new Set([
  "grape", "butter", "corn", "pea", "pro", "black", "blue", "pine", "apple", "milk", "cream",
  "sweet", "short", "sour", "bread", "oat", "egg", "ham", "hot", "pork", "sun", "coco", "car",
  "man", "bar", "ice", "tea", "nut", "red", "green", "white", "gold", "sea", "pop", "pan",
  "pot", "fig", "jam", "pie", "bun", "roll", "sub", "dip", "soy", "rye", "raw", "dry", "lime",
]);
const wordMatch = (a, b) => {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 4 && !DISTINCT_WORDS.has(short) && long.startsWith(short);
};
const has = (pool, w) => pool.some((p) => wordMatch(p, w));

// Sizes: "32oz", "1.5 OZ", "8CT", "12 ct", "64 fl oz", "2 lb".
// Fluid ounces count as ounces: receipts rarely say which.
const UNIT = { oz: "oz", ounce: "oz", floz: "oz", fz: "oz", ct: "ct", count: "ct", pk: "ct", pack: "ct", lb: "lb", g: "g", gram: "g", grams: "g", ml: "ml", l: "l" };
export function sizes(text) {
  const out = [];
  for (const m of String(text || "").toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|floz|fz|oz|ounce|ct|count|pk|pack|lb|grams?|g|ml|l)\b/g)) {
    const u = m[2].replace(/[.\s]/g, "");
    out.push({ n: Number(m[1]), unit: UNIT[u] || u });
  }
  return out;
}
const sameSize = (a, b) => a.unit === b.unit && Math.abs(a.n - b.n) <= Math.max(0.05 * b.n, 0.1);

// What the offer's terms list: "• Vanilla, 4 ct" → { words: ["vanilla"], size: {4 ct} }.
function variants(offer) {
  return String(offer.terms || "")
    .split(/\r?\n/)
    .filter((l) => /^\s*[•\-*]/.test(l))
    .map((l) => {
      const text = l.replace(/^\s*[•\-*]\s*/, "");
      return { text, words: words(text.replace(/,.*$/, "")), size: sizes(text)[0] || null };
    });
}

// Category words receipts often leave out ("McCormick Garlic Powder", not
// "McCormick Spices or Seasonings Garlic Powder"). Any other word in the
// offer's name is a product line ("Pro", "Triple Zero") and must be there.
const CATEGORY = new Set([
  "spice", "seasoning", "yogurt", "greek", "cheese", "milk", "cereal", "bar", "juice", "sauce",
  "snack", "drink", "beverage", "cracker", "cookie", "chip", "candy", "chocolate", "coffee",
  "creamer", "bread", "dressing", "soup", "broth", "frozen", "ice", "cream", "pasta", "rice",
  "food", "treat", "water", "tea", "dip", "spread", "mix", "meal", "dinner", "entree",
  // Describing words, not product lines.
  "probiotic", "organic", "natural", "original", "classic", "premium", "product", "lotion",
]);

// Size limits: "32 oz only", "7 oz or larger", "12 ct only", in the short
// description or the first line of the terms ("…select varieties, 32 oz only.").
function sizeRule(offer) {
  const first = String(offer.terms || "").split(/\r?\n/)[0];
  // "Excludes travel sizes and products under 3oz" isn't a size limit.
  const d = `${offer.description || ""} ${/\bonly\b|or larger|or more|or smaller|or less/i.test(first) ? first : ""}`
    .toLowerCase().replace(/\bexclud[^.]*\.?/g, "");
  const s = sizes(d)[0];
  if (!s) return null;
  if (/or larger|or more|\+/.test(d)) return (x) => x.unit === s.unit && x.n >= s.n * 0.98;
  if (/or smaller|or less/.test(d)) return (x) => x.unit === s.unit && x.n <= s.n * 1.02;
  const all = sizes(d);
  return (x) => all.some((y) => sameSize(x, y));
}

const itemCache = new WeakMap();
function prepItem(item) {
  if (item && typeof item === "object" && itemCache.has(item)) return itemCache.get(item);
  const name = String(item?.name || "");
  const data = {
    name,
    itemWords: words(name),
    itemSizes: sizes(name),
    isStoreBrand: STORE_BRANDS.test(name),
  };
  if (item && typeof item === "object") itemCache.set(item, data);
  return data;
}

const offerCache = new WeakMap();
function prepOffer(offer) {
  if (offer && typeof offer === "object" && offerCache.has(offer)) return offerCache.get(offer);
  let core = words(offer?.name);
  if (offer?.anyBrand) core = core.filter((w) => !["any", "brand"].includes(w));
  const data = {
    core,
    list: variants(offer),
    rule: sizeRule(offer),
  };
  if (offer && typeof offer === "object") offerCache.set(offer, data);
  return data;
}

// Does `item` (a receipt line { name }) match `offer`? Returns null, or
// { level: "exact" | "possible", why }.
export function matchItem(item, offer) {
  const { name, itemWords, itemSizes, isStoreBrand } = prepItem(item);
  if (!name || /item name not found/i.test(name)) return null;
  if (offer.anyItem) return null; // "Any receipt" style offers are handled per receipt.

  // The product the offer is about. "Any Brand Turkey Roast" drops the brand.
  const { core, list, rule } = prepOffer(offer);
  if (!core.length) return null;
  if (isStoreBrand && !offer.anyBrand) return null;

  // The brand (first word) must be there, and most of the rest of the name.
  const brand = core[0];
  if (!offer.anyBrand && !has(itemWords, brand)) return null;
  const itemSize = itemSizes[0] || null;

  // Brand plus a listed product ("McCormick" + "Garlic Powder, 3.12 oz") is
  // enough when the only words missing are category words like "Spices".
  const sizeFits = (v) => (v.size ? itemSize && sameSize(itemSize, v.size) : !rule || (itemSize && rule(itemSize)));
  const rest = core.slice(offer.anyBrand ? 0 : 1);
  const lineOk = rest.every((w) => has(itemWords, w) || CATEGORY.has(w));
  if (!lineOk) return null;
  if (!offer.anyBrand) {
    for (const v of list) {
      if (v.words.length && v.words.every((w) => has(itemWords, w)) && sizeFits(v)) {
        return { level: "exact", why: `Listed: ${v.text}${!v.size && rule ? ` (${String(offer.terms).match(/[\d.]+\s*(?:fl\.?\s*)?oz[^.,\n]*/i)?.[0] || "size fits"})` : ""}` };
      }
    }
  }

  // Otherwise most of the product name must be there. Receipts often drop
  // the category ("Greek Yogurt"), so half is enough.
  const hits = rest.filter((w) => has(itemWords, w)).length;
  if (rest.length && hits < Math.max(1, Math.ceil(rest.length / 2))) return null;

  if (list.length) {
    for (const v of list) {
      const flavourOk = v.words.every((w) => has(itemWords, w) || has(core, w));
      if (flavourOk && sizeFits(v)) return { level: "exact", why: `Listed: ${v.text}` };
    }
    return { level: "possible", why: `Not sure your ${itemSize ? `${itemSize.n} ${itemSize.unit} ` : ""}item is on the list: ${list.map((v) => v.text).join("; ")}` };
  }
  if (rule) {
    if (itemSize && rule(itemSize)) return { level: "exact", why: `Size fits: ${offer.description}` };
    return { level: "possible", why: `Check the size: ${offer.description}` };
  }
  if (/select (varieties|sizes)/i.test(offer.terms || "")) return { level: "possible", why: "Offer is for select varieties or sizes; check the details." };
  return { level: "exact", why: offer.description && !/see offer details/i.test(offer.description) ? offer.description : "Any variety" };
}

// Things you buy often (or bought lately): one entry per product, newest first.
export function usualItems(receipts, { since = 120, minTimes = 2, recentDays = 14 } = {}) {
  const now = Date.now();
  const byKey = new Map();
  for (const r of receipts) {
    const at = Date.parse(r.at);
    if (!(now - at <= since * 864e5)) continue;
    for (const it of r.items || []) {
      if (!it.name || /item name not found/i.test(it.name)) continue;
      const key = it.upc || words(it.name).join(" ");
      const e = byKey.get(key) || { name: it.name, upc: it.upc, times: 0, last: 0, banners: new Set() };
      e.times++;
      e.last = Math.max(e.last, at);
      e.banners.add(r.banner);
      byKey.set(key, e);
    }
  }
  return [...byKey.values()]
    .filter((e) => e.times >= minTimes || now - e.last <= recentDays * 864e5)
    .sort((a, b) => b.last - a.last)
    .map((e) => ({ ...e, banners: [...e.banners] }));
}

const live = (o, at = Date.now()) => !o.expiration || Date.parse(o.expiration) > at;

// Offers worth adding before you shop, for the things you usually buy.
export function matchUsual(items, offers) {
  const out = [];
  for (const o of offers.filter((o) => live(o))) {
    const matched = [];
    let best = null;
    for (const it of items) {
      const m = matchItem(it, o);
      if (!m) continue;
      matched.push(it.name);
      if (!best || m.level === "exact") best = m;
    }
    if (best) out.push({ offer: o, level: best.level, why: best.why, items: matched });
  }
  return out.sort((a, b) => (a.level === b.level ? (b.offer.amount || 0) - (a.offer.amount || 0) : a.level === "exact" ? -1 : 1));
}

// Receipts still young enough to scan into Ibotta (7 days), with the offers
// each one can claim. Offers added after the trip only pay through a receipt
// scan in the Ibotta app, not a linked card.
export const SCAN_DAYS = 7;
export function matchReceipts(receipts, offersFor, now = Date.now()) {
  const out = [];
  for (const r of receipts) {
    const at = Date.parse(r.at);
    const deadline = at + SCAN_DAYS * 864e5;
    if (!(deadline > now)) continue;
    const offers = offersFor(r.banner) || [];
    const hits = [];
    for (const o of offers.filter((o) => live(o, at))) {
      if (o.anyItem && /receipt/i.test(o.name)) { hits.push({ offer: o, level: "exact", why: "Any grocery receipt", items: [] }); continue; }
      const items = [];
      let best = null;
      for (const it of r.items || []) {
        const m = matchItem(it, o);
        if (!m) continue;
        items.push(it.name);
        if (!best || m.level === "exact") best = m;
      }
      if (best) hits.push({ offer: o, level: best.level, why: best.why, items });
    }
    if (hits.length) out.push({ receipt: { id: r.id, at: r.at, store: r.store, banner: r.banner, total: r.total }, deadline, hits });
  }
  return out.sort((a, b) => a.deadline - b.deadline);
}

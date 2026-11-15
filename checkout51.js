// Checkout 51: this week's offers, shaped for matcher.js.
//
// The offer list is the same JSON the site's own offers page loads:
// GET www.checkout51.com/account/offers?page=N with "X-Requested-With:
// XMLHttpRequest" (the reply starts with Angular's ")]}'," guard), 20 per
// page. It works signed out; signed in, Checkout 51 may add targeted offers.
// Read-only: CouponSweep never adds or claims anything on Checkout 51. On the
// upload page it only ticks the offers that match, and the user attaches the
// receipt photo and submits (content/checkout51.js).
//
// US offers run Sunday 12:00 AM to Saturday 11:59 PM local time, and receipts
// must be uploaded while the offers are live.

const BASE = "https://www.checkout51.com";
export const C51_UPLOAD = `${BASE}/account/upload`;

export async function fetchC51Offers() {
  const offers = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const r = await fetch(`${BASE}/account/offers?page=${page}`, {
      headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
      credentials: "include",
    });
    if (!r.ok) throw new Error(`Checkout 51 answered ${r.status}`);
    const j = JSON.parse((await r.text()).replace(/^\)\]\}',?\s*/, ""));
    pages = j.num_pages || 1;
    offers.push(...(j.offers || []));
  }
  return offers.filter((o) => Number(o.cash_back) > 0 && !o.disabled && !o.deleted && o.visible !== false);
}

// The current offer week: from the most recent Sunday 00:00 to Saturday 23:59.
export function c51Week(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() - 1 };
}

const clean = (s) => String(s || "").replace(/[®™]/g, "").replace(/\s+/g, " ").trim();

// One Checkout 51 offer becomes one or more matcher offers (same id):
//   "Buy 2: Chobani Multipack or Multi-Serve Yogurt" → units 2, and the names
//   "Chobani Multipack Yogurt" / "Chobani Multi-Serve Yogurt";
//   "Valid on 5 ct Strawberry or Mixed Berry." → listed varieties;
//   "Valid on 8.1 oz. or larger." / "Any variety." → a size rule or anything.
export function toMatcherOffers(o) {
  let name = clean(o.name).replace(/^buy\s+\d+\s*:\s*/i, "").replace(/^select\s+/i, "");
  const units = Number(o.units) || Number(clean(o.name).match(/^buy\s+(\d+)/i)?.[1]) || 1;
  const desc = clean(o.description).replace(/\s*Items must appear on the same receipt\.?/i, "");
  const base = {
    id: String(o.offer_id),
    source: "checkout51",
    value: `$${Number(o.cash_back).toFixed(2)} cash back`,
    amount: Number(o.cash_back),
    units,
    // Offers tied to particular chains list them; CouponSweep can't tell which
    // chains those ids are, so such offers are only ever "possible".
    storeLimited: Array.isArray(o.store_ids) && o.store_ids.length > 0,
    storeText: o.store_availability_text || "",
    description: desc,
    terms: "",
  };

  // "Valid on …": a size limit alone, or a list of varieties.
  const valid = desc.match(/^valid on (.+?)\.?$/i)?.[1];
  const sizeOnly = valid && /^[\d.]+\s*(fl\.?\s*)?(oz|ct|lb|roll|count|pack)\.?(\s+or (larger|more|smaller|less))?$/i.test(valid.trim());
  if (valid && !sizeOnly) {
    base.terms = valid.split(/;|,(?![^(]*\))|\s+or\s+/i).map((p) => `• ${p.trim()}`).filter((p) => p.length > 3).join("\n");
    base.description = "";
  } else if (sizeOnly) {
    base.description = valid.replace(/\.(?=\s|$)/g, "") + (/(or|only)/i.test(valid) ? "" : " only");
  }

  // Alternatives in the name share the brand: "Dixie Ultra or Dixie Plates or
  // Bowls", "NIVEA Hand, Body Lotion, or Crème Products".
  const parts = name.split(/,\s*(?:or\s+)?|\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [{ ...base, name }];
  const brand = parts[0].split(" ")[0];
  const tail = parts.at(-1).split(" ").slice(1).join(" "); // "… Products", "… Yogurt"
  return parts.map((p, i) => {
    let n = p.toLowerCase().startsWith(brand.toLowerCase()) ? p : `${brand} ${p}`;
    if (i < parts.length - 1 && tail && !n.toLowerCase().endsWith(tail.toLowerCase().split(" ").at(-1))) n = `${n} ${tail.split(" ").at(-1)}`;
    return { ...base, name: n };
  });
}

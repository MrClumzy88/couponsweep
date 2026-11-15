// Runs stores: opens (or reuses) each store's coupon page, tells the
// page-world runner to go, and waits for its result.
//
// Different sites run at the same time, in "lanes": each family of stores that
// clips through the site's own API (H-E-B, Target, Kroger banners, Albertsons
// banners) gets its own lane, and every store whose adapter presses the page's
// buttons (`drivesPage` in stores.js) shares one lane, since scrolling and
// clicking need a page that's rendering. Stores in one lane go one at a time,
// so each site still sees one coupon at a time with the usual pauses.
//
// Storage (chrome.storage.local):
//   settings: { enabled: {heb: true, …}, pinned: {heb: true, …}, order: [ids], daily: false,
//              dailyHour: 0–23 to run at that hour, or null for any time,
//              notify: true (summary notification after the daily run),
//              acknowledged: true once the user accepts the popup's notice }
//   results:  { heb: {status, total, already, clipped, failed, savings, message, at}, … }
//   history:  [{ store, at, clipped, savings }, …] one entry per run that clipped
//             something, kept for about a year (the popup's monthly total)
//   live:     { heb: "Clipping… 12 clipped.", … } for stores running now, else null

import { STORES, runnable, sortStores } from "./stores.js";
import { ibottaStoreUrl } from "./rebates.js";
import { usualItems, matchUsual, matchReceipts, matchItem } from "./matcher.js";
import { fetchC51Offers, toMatcherOffers, c51Week } from "./checkout51.js";

const RUN_TIMEOUT_MS = 60 * 60 * 1000; // Walmart's search pass can run long.
const DAILY_ALARM = "daily-clip";
const NOTIFICATION = "run-summary";
const HISTORY_DAYS = 400;
const pending = new Map(); // tabId -> resolve(result)
let queue = Promise.resolve();

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return {
    enabled: Object.fromEntries(STORES.map((s) => [s.id, settings?.enabled?.[s.id] ?? false])),
    daily: settings?.daily ?? false,
    dailyHour: Number.isInteger(settings?.dailyHour) ? settings.dailyHour : null,
    notify: settings?.notify ?? true,
    riskAccepted: settings?.riskAccepted || {},
    // Checked stores in the order the popup shows them.
    checkedInOrder: sortStores(STORES, settings).map((s) => s.id).filter((id) => settings?.enabled?.[id]),
  };
}

// Several stores run at once, so read-modify-write storage updates go through
// one chain to keep them from overwriting each other.
let storageChain = Promise.resolve();
function update(key, fn) {
  storageChain = storageChain
    .then(async () => {
      const current = (await chrome.storage.local.get(key))[key];
      await chrome.storage.local.set({ [key]: fn(current) });
    })
    .catch((e) => console.error("[CouponSweep]", e));
  return storageChain;
}

function setLive(storeId, text) {
  return update("live", (live) => ({ ...(isLiveMap(live) ? live : {}), [storeId]: text }));
}
function clearLive(storeId) {
  return update("live", (live) => {
    const next = { ...(isLiveMap(live) ? live : {}) };
    delete next[storeId];
    return Object.keys(next).length ? next : null;
  });
}
// Versions before 0.8 stored { store, text }.
const isLiveMap = (live) => live && typeof live === "object" && !("store" in live && "text" in live);

// Saves a store's result and, if it clipped anything, adds it to the history.
function record(storeId, result) {
  const at = Date.now();
  update("results", (results = {}) => ({ ...results, [storeId]: { ...result, at } }));
  if (result.clipped > 0) {
    const cutoff = at - HISTORY_DAYS * 24 * 60 * 60 * 1000;
    update("history", (history = []) => [
      ...history.filter((h) => h.at >= cutoff),
      { store: storeId, at, clipped: result.clipped, savings: Math.round((result.savings || 0) * 100) / 100 },
    ]);
  }
  return clearLive(storeId);
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => { if (t.status === "complete") done(); }).catch(done);
  });
}

// The content scripts load at document_idle; retry until the runner answers.
async function startRunner(tabId, auto, opts) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "gbc-run", auto, opts });
      if (res?.ready) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// ── Rebates: receipts → matching Ibotta offers ────────────────────────────
// Storage:
//   purchases:    { receipts: { <id>: {id, at, banner, store, total, items} }, syncedAt }
//                 your in-store receipts from Albertsons-family sites (120 days)
//   ibottaOffers: { <ibotta retailer id>: { at, offers: [...] } }
//   rebates:      { at, usual: [...], receipts: [...] } what the popup shows
// All of it stays in chrome.storage.local.

const PURCHASE_DAYS = 120;
const pendingPurchases = new Map(); // tabId -> resolve(data)
const ALBERTSONS = STORES.filter((s) => s.adapter === "albertsons");
const ibottaRetailerId = (storeId) => ibottaStoreUrl(storeId)?.match(/\/(\d+)$/)?.[1] || null;

// Opens the purchases page on an Albertsons-family site (one account covers
// every banner) and reads any receipts not already saved.
async function syncPurchases(checkedInOrder) {
  const site = ALBERTSONS.find((s) => checkedInOrder.includes(s.id)) || ALBERTSONS[0];
  const url = `https://${site.host}/order-account/orders`;
  const { purchases = { receipts: {} } } = await chrome.storage.local.get("purchases");
  const existing = (await chrome.tabs.query({ url: `https://${site.host}/order-account/orders*` }))[0];
  const tab = existing || await chrome.tabs.create({ url, active: false });
  await setLive("ibotta", `Reading your ${site.name} receipts…`);
  await waitForLoad(tab.id);
  const data = await new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve({ error: "error", message: "Reading receipts timed out." }), 10 * 60 * 1000);
    pendingPurchases.set(tab.id, (d) => { clearTimeout(timer); resolve(d); });
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      try { ok = (await chrome.tabs.sendMessage(tab.id, { type: "gbc-sync-purchases", known: Object.keys(purchases.receipts), days: PURCHASE_DAYS }))?.ready; } catch {}
      if (!ok) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ok) { clearTimeout(timer); resolve({ error: "error", message: `${site.name}'s purchases page didn't load.` }); }
  });
  pendingPurchases.delete(tab.id);
  if (!existing && !data.error) chrome.tabs.remove(tab.id).catch(() => {});
  if (data.error) return { ...data, site };

  const cutoff = Date.now() - (PURCHASE_DAYS + 30) * 864e5;
  const receipts = Object.fromEntries(
    [...Object.values(purchases.receipts), ...(data.receipts || [])]
      .filter((r) => Date.parse(r.at) >= cutoff)
      .map((r) => [r.id, r]),
  );
  await chrome.storage.local.set({ purchases: { receipts, syncedAt: Date.now() } });
  return { receipts: Object.values(receipts), added: (data.receipts || []).length, site };
}

// ── Receipt image (content/albertsons-receipt.js) ─────────────────────────
// Scrolls through an Albertsons-family receipt-details page, screenshots
// each screenful and stitches the receipt block into one PNG (data URL).
// captureVisibleTab only sees the tab that's showing, and Chrome allows about
// two captures a second.
async function captureReceipt(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const ask = (m) => chrome.tabs.sendMessage(tabId, m);
  let g = null;
  for (let i = 0; i < 20 && !(g && !g.error); i++) {
    try { g = await ask({ type: "receipt-geometry" }); } catch {}
    if (!g || g.error) await new Promise((r) => setTimeout(r, 500));
  }
  if (!g || g.error) return { error: g?.error || "The receipt page didn't load." };
  try {
    const shots = [];
    for (let y = g.top; y < g.top + g.height; y += g.vh) {
      const { y: at } = await ask({ type: "receipt-scroll", y });
      const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      shots.push({ at, bitmap: await createImageBitmap(await (await fetch(url)).blob()) });
      await new Promise((r) => setTimeout(r, 600));
    }
    const s = g.dpr;
    const canvas = new OffscreenCanvas(Math.round(g.width * s), Math.round(g.height * s));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const { at, bitmap } of shots) {
      // This screenful shows the page from `at` to `at + vh`.
      const from = Math.max(g.top, at);
      const to = Math.min(g.top + g.height, at + g.vh);
      if (to <= from) continue;
      ctx.drawImage(bitmap,
        Math.round(g.left * s), Math.round((from - at) * s), Math.round(g.width * s), Math.round((to - from) * s),
        0, Math.round((from - g.top) * s), Math.round(g.width * s), Math.round((to - from) * s));
    }
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { image: `data:image/png;base64,${btoa(bin)}`, barcode: g.barcode, date: g.date };
  } catch (e) {
    return { error: `Couldn't take the picture: ${e?.message || e}. Open the receipt, then press Save receipt image in CouponSweep.` };
  } finally {
    ask({ type: "receipt-restore" }).catch(() => {});
  }
}

// Checkout 51 for one receipt: open its receipt page, picture it, then open
// the upload page with that picture attached and the matching offers ticked
// (content/checkout51.js). The user checks it and submits.
async function prepareC51({ tx, host, ids = [], label, tabId }) {
  let tab = tabId ? await chrome.tabs.get(tabId) : null;
  if (!tab) {
    tab = await chrome.tabs.create({ url: `https://${host}/order-account/orders/instore/${tx}/receipt-details`, active: true });
    await waitForLoad(tab.id);
  }
  const shot = await captureReceipt(tab.id);
  await chrome.storage.local.set({ c51Prefill: { ids, label, at: Date.now(), image: shot.image || null, imageName: `receipt-${(shot.date || "").replace(/[^\w]+/g, "-") || tx || "albertsons"}.png` } });
  await chrome.tabs.create({ url: "https://www.checkout51.com/account/upload", active: true });
  return shot.error ? { error: shot.error } : { ok: true };
}

const offerLink = (o) => `https://ibotta.com/offers/${encodeURIComponent(String(o.name || "offer").replace(/[^\w]+/g, "_"))}/${o.id}`;
const slim = (o) => ({ id: o.id, name: o.name, value: o.value, amount: o.amount, description: o.description, activated: o.activated, url: offerLink(o) });

// Checkout 51: this week's offers (read-only) against this week's receipts
// and the things you usually buy. Offers tied to particular chains, and
// "Buy 2" offers short of the count, are only "possible".
async function checkoutFiftyOne(recent) {
  const week = c51Week();
  const offers = (await fetchC51Offers()).flatMap(toMatcherOffers);
  const best = (list) => {
    const byId = new Map();
    for (const h of list) {
      const prev = byId.get(h.offer.id);
      if (!prev || (prev.level !== "exact" && h.level === "exact")) byId.set(h.offer.id, { ...h, items: [...new Set([...(prev?.items || []), ...h.items])] });
    }
    return [...byId.values()];
  };
  const limit = (h, qty) => {
    if (h.offer.storeLimited) return { ...h, level: "possible", why: `Only at select stores${h.offer.storeText ? ` (${h.offer.storeText})` : ""}. ${h.why}` };
    if (qty != null && qty < h.offer.units) return { ...h, level: "possible", why: `Needs ${h.offer.units} on one receipt; you bought ${qty}. ${h.why}` };
    return h;
  };
  const slimC51 = (o) => ({ id: o.id, name: o.name, value: o.value, amount: o.amount, url: `https://www.checkout51.com/account/offers` });

  const receipts = [];
  for (const r of recent.filter((r) => Date.parse(r.at) >= week.start)) {
    const hits = [];
    for (const o of offers) {
      let qty = 0, m = null;
      const items = [];
      for (const it of r.items || []) {
        const x = matchItem(it, o);
        if (!x) continue;
        items.push(it.name);
        qty += it.qty >= 1 ? Math.round(it.qty) : 1;
        if (!m || x.level === "exact") m = x;
      }
      if (m) hits.push(limit({ offer: o, level: m.level, why: m.why, items }, qty));
    }
    const merged = best(hits).map((h) => ({ ...h, offer: slimC51(h.offer) }));
    if (merged.length) receipts.push({ receipt: { id: r.id, tx: r.tx, at: r.at, store: r.store, banner: r.banner, host: STORES.find((s) => s.id === r.banner)?.host, total: r.total }, deadline: week.end, hits: merged });
  }
  const usual = best(matchUsual(usualItems(recent), offers).map((m) => limit(m))).map((m) => ({ ...m, offer: slimC51(m.offer) }));
  return { weekEnd: week.end, receipts, usual };
}

// Fetch pays points on any receipt scanned in its app within 14 days (35 a
// week), so this just lists the ones still in time.
const FETCH_DAYS = 14;
const fetchList = (recent) => recent
  .filter((r) => Date.now() - Date.parse(r.at) < FETCH_DAYS * 864e5)
  .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  .map((r) => ({ id: r.id, at: r.at, store: r.store, total: r.total, items: r.items?.length || 0, deadline: Date.parse(r.at) + FETCH_DAYS * 864e5 }));

// Find my rebates: read your receipts, then Checkout 51 (read-only), Fetch
// (a reminder list) and, only if the user accepted its warning, Ibotta:
// read each store's Ibotta offers, then add only the offers that exactly
// match what you buy (before you shop: works with a linked store card) or
// bought in the last 7 days (scan that receipt in the Ibotta app).
async function runIbotta(store, auto, foreground) {
  const fail = async (status, message) => { const r = { status, message }; await record(store.id, r); return r; };
  const { riskAccepted, checkedInOrder } = await getSettings();
  const ibottaOn = !!riskAccepted[store.id];

  // 1. Receipts.
  const sync = await syncPurchases(checkedInOrder);
  if (sync.error) return fail(sync.error, `${sync.site.name}: ${sync.message}`);
  const receipts = sync.receipts;
  const recent = receipts.filter((r) => Date.now() - Date.parse(r.at) <= PURCHASE_DAYS * 864e5);

  // 2. Checkout 51 and Fetch.
  await setLive(store.id, "Checking Checkout 51…");
  let c51;
  try { c51 = await checkoutFiftyOne(recent); } catch (e) { c51 = { error: `Couldn't read Checkout 51's offers: ${e?.message || e}` }; }
  const fetchReceipts = fetchList(recent);
  const base = { at: Date.now(), receiptsRead: receipts.length, c51, fetch: fetchReceipts };
  if (!ibottaOn) {
    await chrome.storage.local.set({ rebates: { ...base, ibottaOff: true, usual: [], receipts: [] } });
    const n = (c51.receipts || []).length;
    return fail("ok", `Checked ${receipts.length} receipts. ${n ? `${n} to upload to Checkout 51. ` : ""}${fetchReceipts.length} to scan in Fetch. Ibotta is off.`);
  }

  // 3. Which Ibotta store pages: where you shop (receipts) plus checked stores.
  const storeIds = [...new Set([...recent.map((r) => r.banner), ...checkedInOrder])].filter((id) => ibottaStoreUrl(id));
  if (!storeIds.length) return fail("error", "None of your stores are on Ibotta yet.");

  // 3. Read each store's offers.
  const { ibottaOffers = {} } = await chrome.storage.local.get("ibottaOffers");
  const rids = [...new Set(storeIds.map(ibottaRetailerId))];
  for (const rid of rids) {
    const id = storeIds.find((s) => ibottaRetailerId(s) === rid);
    const r = await runStore({ ...store, url: ibottaStoreUrl(id) }, auto, foreground, false, { mode: "scan" });
    if (r.status !== "ok") return fail(r.status, r.message);
  }
  Object.assign(ibottaOffers, (await chrome.storage.local.get("ibottaOffers")).ibottaOffers || {});
  const offersFor = (banner) => ibottaOffers[ibottaRetailerId(banner)]?.offers || [];

  // 4. Match.
  const usual = [];
  for (const rid of rids) {
    const banners = storeIds.filter((s) => ibottaRetailerId(s) === rid);
    const items = usualItems(recent.filter((r) => banners.includes(r.banner)));
    for (const m of matchUsual(items, ibottaOffers[rid]?.offers || [])) {
      usual.push({ store: STORES.find((s) => s.id === banners[0])?.name || banners[0], retailerId: rid, level: m.level, why: m.why, items: m.items, offer: slim(m.offer) });
    }
  }
  const toScan = matchReceipts(recent, offersFor).map((x) => ({
    ...x,
    retailerId: ibottaRetailerId(x.receipt.banner),
    hits: x.hits.map((h) => ({ level: h.level, why: h.why, items: h.items, offer: slim(h.offer) })),
  }));

  // 5. Add the exact matches that aren't on the list yet, one store page at a time.
  const addIds = new Map();
  const want = (rid, o) => { if (!o.activated) { if (!addIds.has(rid)) addIds.set(rid, new Set()); addIds.get(rid).add(o.id); } };
  for (const m of usual) if (m.level === "exact") want(m.retailerId, m.offer);
  for (const x of toScan) for (const h of x.hits) if (h.level === "exact") want(x.retailerId, h.offer);
  const sum = { status: "ok", total: 0, already: 0, clipped: 0, failed: 0, savings: 0 };
  for (const [rid, ids] of addIds) {
    const id = storeIds.find((s) => ibottaRetailerId(s) === rid);
    const r = await runStore({ ...store, url: ibottaStoreUrl(id) }, auto, foreground, false, { mode: "add", ids: [...ids] });
    sum.clipped += r.clipped || 0;
    sum.failed += r.failed || 0;
    if (r.status !== "ok") { sum.status = r.status; sum.message = r.message; break; }
  }
  for (const [, ids] of addIds) sum.total += ids.size;

  await chrome.storage.local.set({ rebates: { ...base, usual, receipts: toScan } });
  const exact = usual.filter((m) => m.level === "exact").length;
  const scans = toScan.filter((x) => x.hits.some((h) => h.level === "exact")).length;
  sum.message ??= `${exact} rebate${exact === 1 ? "" : "s"} for things you buy` +
    (sum.clipped ? ` (${sum.clipped} added)` : "") +
    (scans ? `; ${scans} receipt${scans === 1 ? "" : "s"} to scan in Ibotta` : "") +
    ((c51.receipts || []).length ? `; ${c51.receipts.length} for Checkout 51` : "") +
    `; ${fetchReceipts.length} to scan in Fetch.`;
  await record(store.id, sum);
  return sum;
}

async function runStore(store, auto, foreground, save = true, opts = {}) {
  if (store.id === "ibotta" && save) return runIbotta(store, auto, foreground);
  // Reuse a tab that's already on the coupon page; never navigate away from
  // whatever else the user has open on that site.
  // Single-page sites keep every screen on one path, so compare the #route too.
  const { pathname: path, hash } = new URL(store.url);
  const route = (h) => h.split("?")[0];
  const existing = (await chrome.tabs.query({ url: `https://${store.host}/*` }))
    .find((t) => {
      if (!t.url) return false;
      const u = new URL(t.url);
      return u.pathname === path && (!hash || route(u.hash) === route(hash));
    });
  const tab = existing || await chrome.tabs.create({ url: store.url, active: foreground });
  await setLive(store.id, "Opening page…");
  await waitForLoad(tab.id);
  // Ibotta sends signed-out visitors (and new devices) to its sign-in site,
  // where the clipper doesn't load.
  const landed = await chrome.tabs.get(tab.id).catch(() => null);
  if (landed?.url && new URL(landed.url).hostname.startsWith("authenticate.")) {
    const result = { status: "login", message: `Sign in to ${store.name.replace(/ \(.*\)$/, "")} (and finish any check it asks for), then run again.` };
    if (save) await record(store.id, result);
    return result;
  }

  const result = await new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve({ status: "error", message: "Timed out." }), RUN_TIMEOUT_MS);
    pending.set(tab.id, (r) => { clearTimeout(timer); resolve(r); });
    if (!(await startRunner(tab.id, auto, opts))) {
      pending.delete(tab.id);
      clearTimeout(timer);
      resolve({ status: "error", message: "The page didn't load the clipper. Reload it and try again." });
    }
  });
  pending.delete(tab.id);

  // Leave the tab open when the user has to do something in it.
  if (!existing && auto && result.status === "ok") chrome.tabs.remove(tab.id).catch(() => {});

  if (save) await record(store.id, result);
  else await clearLive(store.id).then(() => setLive(store.id, result.message || "Next store…"));
  return result;
}

// Groups stores into lanes (see the top of this file), keeping their order.
function lanesFor(storeIds) {
  const lanes = new Map();
  for (const id of storeIds) {
    const store = STORES.find((s) => s.id === id);
    if (!store || !runnable(store)) continue;
    const key = store.drivesPage ? "page" : `api:${store.adapter}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(store);
  }
  return lanes;
}

function enqueue(storeIds, auto) {
  queue = queue.then(async () => {
    const lanes = lanesFor(storeIds);
    const single = [...lanes.values()].flat().length === 1;
    const outcomes = [];
    await Promise.all([...lanes].map(async ([key, stores]) => {
      for (const store of stores) {
        // A manual run brings the page-driving stores to the front, as before;
        // API stores don't need to be seen, so they open behind it.
        const foreground = !auto && (single || key === "page");
        outcomes.push({ store, result: await runStore(store, auto, foreground) });
      }
    }));
    // Report in the popup's order, not the order the lanes finished in.
    outcomes.sort((a, b) => storeIds.indexOf(a.store.id) - storeIds.indexOf(b.store.id));
    await finish(outcomes, auto);
  }).catch((e) => console.error("[CouponSweep]", e));
  return queue;
}

const NEEDS = { login: "sign in", blocked: "blocked, try later", error: "error", stopped: "stopped" };
const money = (n) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

// Badge and (after the daily run) a notification summing up the whole run.
async function finish(outcomes, auto) {
  const clipped = outcomes.reduce((n, o) => n + (o.result.clipped || 0), 0);
  const savings = outcomes.reduce((n, o) => n + (o.result.savings || 0), 0);
  const attention = outcomes.filter((o) => o.result.status !== "ok");

  // "!" (not just a colour) when a store needs the user.
  chrome.action.setBadgeBackgroundColor({ color: attention.length ? "#b45309" : "#16a34a" });
  chrome.action.setBadgeText({ text: attention.length ? "!" : clipped ? String(clipped) : "" });

  const { notify } = await getSettings();
  if (!auto || !notify || (!clipped && !attention.length)) return;

  const lines = [];
  if (clipped) {
    const perStore = outcomes.filter((o) => o.result.clipped).map((o) => `${o.store.name} ${o.result.clipped}`);
    lines.push(`Clipped ${clipped} coupon${clipped === 1 ? "" : "s"}${savings ? ` (at least ${money(savings)} off)` : ""}: ${perStore.join(", ")}.`);
  }
  if (attention.length) {
    lines.push(`Needs you: ${attention.map((o) => `${o.store.name} (${NEEDS[o.result.status] || o.result.status})`).join(", ")}.`);
  }
  chrome.notifications?.create(NOTIFICATION, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: attention.length ? "CouponSweep: a store needs you" : "CouponSweep daily run done",
    message: lines.join("\n"),
    priority: 0,
  });
  await chrome.storage.local.set({ attentionUrl: attention[0]?.store.url || null });
}

// Clicking the notification opens the first store that needs the user.
chrome.notifications?.onClicked.addListener(async (id) => {
  if (id !== NOTIFICATION) return;
  const { attentionUrl } = await chrome.storage.local.get("attentionUrl");
  if (attentionUrl) chrome.tabs.create({ url: attentionUrl });
  chrome.notifications.clear(id);
});

// The next time the clock reads `hour`:00, local time.
function nextAt(hour, from = Date.now()) {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// Only re-create the daily alarm when it's missing or set up differently:
// re-creating it on every settings change would restart the clock and fire a
// run a minute later each time.
//   "Any time" (dailyHour null): repeats every 24 hours from when it was turned on.
//   At an hour: a one-off alarm for the next time the clock reads that hour,
//   set again after each run, so it stays on the hour across daylight saving.
async function syncAlarm() {
  const { daily, dailyHour } = await getSettings();
  if (!daily) return chrome.alarms.clear(DAILY_ALARM);
  const alarm = await chrome.alarms.get(DAILY_ALARM);
  if (dailyHour == null) {
    if (!alarm?.periodInMinutes) chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
    return;
  }
  const at = alarm && !alarm.periodInMinutes && new Date(alarm.scheduledTime);
  if (!at || at.getHours() !== dailyHour || at.getMinutes() !== 0) {
    chrome.alarms.create(DAILY_ALARM, { when: nextAt(dailyHour) });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "sleep") {
    setTimeout(() => sendResponse(true), Math.min(Number(msg.ms) || 0, 60000));
    return true;
  }
  if (msg.type === "capture-receipt") {
    // From the popup: the receipt page the user is looking at.
    captureReceipt(msg.tabId).then(sendResponse);
    return true;
  }
  if (msg.type === "c51-prepare") {
    prepareC51(msg).then(sendResponse);
    return true;
  }
  if (msg.type === "gbc:offers" && sender.tab && msg.data?.retailerId) {
    // Ibotta's offer list for one store, from content/ibotta.js.
    update("ibottaOffers", (all = {}) => ({ ...all, [msg.data.retailerId]: { at: Date.now(), offers: msg.data.offers || [] } }));
  } else if (msg.type === "gbc:purchases" && sender.tab) {
    pendingPurchases.get(sender.tab.id)?.(msg.data || {});
  } else if (msg.type === "gbc:purchases-progress" && sender.tab) {
    setLive("ibotta", `Reading receipts… ${msg.data.done} of ${msg.data.of}`);
  } else if (msg.type === "gbc:progress" && sender.tab) {
    setLive(msg.data.store, msg.data.text);
  } else if (msg.type === "gbc:done" && sender.tab) {
    const resolve = pending.get(sender.tab.id);
    if (resolve) resolve(msg.data);
    else record(msg.data.store, msg.data); // Started from the on-page button rather than the popup.
  } else if (msg.type === "run") {
    // One store, a list of stores (the popup's "try again"), or every checked store.
    const ids = Array.isArray(msg.stores) ? msg.stores.filter((id) => typeof id === "string") : msg.store ? [msg.store] : null;
    getSettings().then(({ checkedInOrder }) => enqueue(ids || checkedInOrder, false));
    sendResponse({ ok: true });
  } else if (msg.type === "settings-changed") {
    syncAlarm();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DAILY_ALARM) return;
  const { checkedInOrder, dailyHour } = await getSettings();
  // A one-off alarm is gone once it fires; set tomorrow's.
  if (dailyHour != null) chrome.alarms.create(DAILY_ALARM, { when: nextAt(dailyHour) });
  enqueue(checkedInOrder.filter((id) => !STORES.find((s) => s.id === id)?.noDaily), true);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ live: null });
  syncAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ live: null });
  syncAlarm();
});

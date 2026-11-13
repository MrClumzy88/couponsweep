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
//              notify: true (summary notification after the daily run),
//              acknowledged: true once the user accepts the popup's notice }
//   results:  { heb: {status, total, already, clipped, failed, savings, message, at}, … }
//   history:  [{ store, at, clipped, savings }, …] one entry per run that clipped
//             something, kept for about a year (the popup's monthly total)
//   live:     { heb: "Clipping… 12 clipped.", … } for stores running now, else null

import { STORES, runnable, sortStores } from "./stores.js";

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
    notify: settings?.notify ?? true,
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
async function startRunner(tabId, auto) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "gbc-run", auto });
      if (res?.ready) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function runStore(store, auto, foreground) {
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

  const result = await new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve({ status: "error", message: "Timed out." }), RUN_TIMEOUT_MS);
    pending.set(tab.id, (r) => { clearTimeout(timer); resolve(r); });
    if (!(await startRunner(tab.id, auto))) {
      pending.delete(tab.id);
      clearTimeout(timer);
      resolve({ status: "error", message: "The page didn't load the clipper. Reload it and try again." });
    }
  });
  pending.delete(tab.id);

  // Leave the tab open when the user has to do something in it.
  if (!existing && auto && result.status === "ok") chrome.tabs.remove(tab.id).catch(() => {});

  await record(store.id, result);
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

// Create the daily alarm only when it's missing: re-creating it on every
// settings change would restart the 24-hour clock and fire a run a minute
// later each time.
async function syncAlarm() {
  const { daily } = await getSettings();
  if (!daily) return chrome.alarms.clear(DAILY_ALARM);
  if (!(await chrome.alarms.get(DAILY_ALARM))) {
    chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "sleep") {
    setTimeout(() => sendResponse(true), Math.min(Number(msg.ms) || 0, 60000));
    return true;
  }
  if (msg.type === "gbc:progress" && sender.tab) {
    setLive(msg.data.store, msg.data.text);
  } else if (msg.type === "gbc:done" && sender.tab) {
    const resolve = pending.get(sender.tab.id);
    if (resolve) resolve(msg.data);
    else record(msg.data.store, msg.data); // Started from the on-page button rather than the popup.
  } else if (msg.type === "run") {
    getSettings().then(({ checkedInOrder }) => enqueue(msg.store ? [msg.store] : checkedInOrder, false));
    sendResponse({ ok: true });
  } else if (msg.type === "settings-changed") {
    syncAlarm();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DAILY_ALARM) return;
  const { checkedInOrder } = await getSettings();
  enqueue(checkedInOrder.filter((id) => !STORES.find((s) => s.id === id)?.noDaily), true);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ live: null });
  syncAlarm();
});
chrome.runtime.onStartup.addListener(() => chrome.storage.local.set({ live: null }));

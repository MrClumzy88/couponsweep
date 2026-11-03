// Runs stores one at a time: opens (or reuses) the store's coupon page,
// tells the page-world runner to go, and waits for its result.
//
// Storage (chrome.storage.local):
//   settings: { enabled: {heb: true, …}, pinned: {heb: true, …}, order: [ids], daily: false,
//              acknowledged: true once the user accepts the popup's notice }
//   results:  { heb: {status, total, already, clipped, failed, message, at}, … }
//   live:     { store, text } while a run is in progress, else null

import { STORES, runnable, sortStores } from "./stores.js";

const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const DAILY_ALARM = "daily-clip";
const pending = new Map(); // tabId -> resolve(result)
let queue = Promise.resolve();

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return {
    enabled: Object.fromEntries(STORES.map((s) => [s.id, settings?.enabled?.[s.id] ?? false])),
    daily: settings?.daily ?? false,
    // Checked stores in the order the popup shows them.
    checkedInOrder: sortStores(STORES, settings).map((s) => s.id).filter((id) => settings?.enabled?.[id]),
  };
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

async function runStore(store, auto) {
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
  const tab = existing || await chrome.tabs.create({ url: store.url, active: !auto });
  await chrome.storage.local.set({ live: { store: store.id, text: "Opening page…" } });
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

  const { results = {} } = await chrome.storage.local.get("results");
  results[store.id] = { ...result, at: Date.now() };
  await chrome.storage.local.set({ results, live: null });
  return result;
}

function enqueue(storeIds, auto) {
  queue = queue.then(async () => {
    let clipped = 0;
    for (const id of storeIds) {
      const store = STORES.find((s) => s.id === id);
      if (store && runnable(store)) clipped += (await runStore(store, auto)).clipped || 0;
    }
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    chrome.action.setBadgeText({ text: clipped ? String(clipped) : "" });
  }).catch((e) => console.error("[CouponSweep]", e));
  return queue;
}

async function syncAlarm() {
  const { daily } = await getSettings();
  if (daily) chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  else chrome.alarms.clear(DAILY_ALARM);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "sleep") {
    setTimeout(() => sendResponse(true), Math.min(Number(msg.ms) || 0, 60000));
    return true;
  }
  if (msg.type === "gbc:progress" && sender.tab) {
    chrome.storage.local.set({ live: { store: msg.data.store, text: msg.data.text } });
  } else if (msg.type === "gbc:done" && sender.tab) {
    const resolve = pending.get(sender.tab.id);
    if (resolve) resolve(msg.data);
    else {
      // Started from the on-page button rather than the popup.
      chrome.storage.local.get("results").then(({ results = {} }) => {
        results[msg.data.store] = { ...msg.data, at: Date.now() };
        chrome.storage.local.set({ results, live: null });
      });
    }
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

chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(() => chrome.storage.local.set({ live: null }));

// Isolated-world bridge between the extension and the page-world runner.
// The runner lives in the page's own JS world (so it can read the site's
// config and send requests exactly like the site does); this script is the
// only part that can talk to chrome.runtime.
//
// Events cross worlds as JSON strings, since object `detail`s don't.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "gbc-sync-purchases") {
    // Albertsons-family purchases page (content/albertsons-purchases.js).
    window.dispatchEvent(new CustomEvent("gbc:sync-purchases", { detail: JSON.stringify({ known: msg.known || [], days: msg.days }) }));
    sendResponse({ ready: true });
    return;
  }
  if (msg?.type !== "gbc-run") return;
  const ready = document.documentElement.dataset.gbcReady === "1";
  if (ready) {
    // `opts` carries per-run settings for adapters that have modes (Ibotta).
    window.dispatchEvent(new CustomEvent("gbc:run", { detail: JSON.stringify({ auto: !!msg.auto, opts: msg.opts || {} }) }));
  }
  sendResponse({ ready });
});

// The page-world runner can't read extension storage, so mirror whether the
// user has accepted the popup's notice onto the page.
// Same for stores with their own risk warning (Ibotta): the ids accepted.
function syncAck(settings) {
  if (settings?.acknowledged) document.documentElement.dataset.gbcAck = "1";
  else delete document.documentElement.dataset.gbcAck;
  const risk = Object.keys(settings?.riskAccepted || {}).join(",");
  if (risk) document.documentElement.dataset.gbcRisk = risk;
  else delete document.documentElement.dataset.gbcRisk;
}
chrome.storage.local.get("settings").then(({ settings }) => syncAck(settings));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) syncAck(changes.settings.newValue);
});

function forward(type) {
  window.addEventListener(type, (e) => {
    let data;
    try { data = JSON.parse(e.detail); } catch { return; }
    chrome.runtime.sendMessage({ type, data }).catch(() => {});
  });
}
forward("gbc:progress");
forward("gbc:done");
forward("gbc:offers"); // Ibotta offer list, for the rebate matcher.
forward("gbc:purchases"); // Receipts, for the rebate matcher.
forward("gbc:purchases-progress");

// Pauses between clips are timed by the service worker, which Chrome doesn't
// throttle the way it throttles timers in background tabs.
window.addEventListener("gbc:sleep", (e) => {
  let req;
  try { req = JSON.parse(e.detail); } catch { return; }
  chrome.runtime.sendMessage({ type: "sleep", ms: req.ms })
    .then(() => window.dispatchEvent(new CustomEvent("gbc:wake", { detail: String(req.id) })))
    .catch(() => {});
});

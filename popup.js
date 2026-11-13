import { STORES, sortStores } from "./stores.js";

const mine = document.getElementById("stores");
const more = document.getElementById("more-stores");
const moreBox = document.getElementById("more");
const empty = document.getElementById("empty");
const tpl = document.getElementById("store-row");
const live = document.getElementById("live");
const runAll = document.getElementById("run-all");
const daily = document.getElementById("daily");
const dailyHour = document.getElementById("daily-hour");
for (let h = 0; h < 24; h++) {
  // Labels in the user's own clock format ("6 AM" or "06:00").
  const label = new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  dailyHour.append(new Option(label, String(h)));
}
const notify = document.getElementById("notify");
const month = document.getElementById("month");
const notice = document.getElementById("notice");

// Donation page (GitHub Sponsors, Ko-fi…). The link stays hidden until this
// is set; see ROADMAP.md.
const DONATE_URL = "";
if (DONATE_URL) Object.assign(document.getElementById("donate"), { href: DONATE_URL, hidden: false });
const rows = {};
let settings = {};

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function saveSettings(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: "settings-changed" });
}

const isMine = (s) => !s.comingSoon && (settings.enabled?.[s.id] || settings.pinned?.[s.id]);

// Background versions before 0.8 stored { store, text }; now it's { storeId: text }.
function liveMap(live) {
  if (!live || typeof live !== "object") return {};
  return "store" in live && "text" in live ? { [live.store]: live.text } : live;
}

const money = (n) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

// "This month: 312 coupons clipped, at least $187 off."
function renderMonth(history = []) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const runs = history.filter((h) => h.at >= start.getTime());
  const clipped = runs.reduce((n, h) => n + (h.clipped || 0), 0);
  const savings = runs.reduce((n, h) => n + (h.savings || 0), 0);
  month.hidden = !clipped;
  month.textContent = `This month: ${clipped} coupon${clipped === 1 ? "" : "s"} clipped` +
    (savings >= 1 ? `, at least ${money(savings)} off.` : ".");
  month.title = "Coupons CouponSweep clipped this month. The dollar amount only counts coupons that show a plain \"$ off\" value, so the real figure is higher.";
}

function render({ results = {}, live: running, history }) {
  const now = liveMap(running);
  const busy = Object.keys(now).length > 0;
  // "Your stores" are the checked or pinned ones, pinned first, then in the
  // order the user dragged them into.
  const ordered = sortStores(STORES, settings);
  let count = 0;
  for (const s of ordered) {
    const row = rows[s.id];
    const on = !!settings.enabled?.[s.id] && !s.comingSoon;
    const pinned = !!settings.pinned?.[s.id];
    row.querySelector(".enabled").checked = on;
    row.querySelector(".enabled").disabled = !!s.comingSoon;
    row.querySelector(".pin").setAttribute("aria-pressed", String(pinned));
    row.querySelector(".pin").title = pinned ? "Unpin" : "Pin to top";
    row.draggable = isMine(s);
    (isMine(s) ? mine : more).append(row);
    if (isMine(s)) count++;

    const r = results[s.id];
    const p = row.querySelector(".result");
    const running = s.id in now;
    p.className = `result ${running ? "running" : r?.status || ""}`;
    p.textContent = s.comingSoon ? "In development."
      : running ? now[s.id]
      : r ? `${r.message} · ${ago(r.at)}` : "Not run yet.";
    row.querySelector(".run").disabled = busy || !!s.comingSoon || !settings.acknowledged;
  }
  empty.hidden = count > 0;
  if (!count) moreBox.open = true;
  daily.checked = settings.daily ?? false;
  daily.disabled = !settings.acknowledged;
  notify.checked = settings.notify ?? true;
  notify.disabled = !settings.acknowledged || !settings.daily;
  dailyHour.value = Number.isInteger(settings.dailyHour) ? String(settings.dailyHour) : "";
  dailyHour.disabled = !settings.acknowledged || !settings.daily;
  notice.hidden = !!settings.acknowledged;
  runAll.disabled = busy || !settings.acknowledged || !STORES.some((s) => settings.enabled?.[s.id] && !s.comingSoon);
  live.hidden = !busy;
  const names = Object.keys(now).map((id) => STORES.find((s) => s.id === id)?.name || id);
  if (busy) live.textContent = `Working on ${names.join(", ")}…`;
  renderMonth(history);
}

// ── Drag to reorder "Your stores" ─────────────────────────────────────────
let dragId = null;
function clearDropMarks() {
  mine.querySelectorAll(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
}
mine.addEventListener("dragstart", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  dragId = li.dataset.id;
  li.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});
mine.addEventListener("dragend", (e) => {
  e.target.closest("li")?.classList.remove("dragging");
  clearDropMarks();
  dragId = null;
});
mine.addEventListener("dragover", (e) => {
  const li = e.target.closest("li");
  if (!dragId || !li || li.dataset.id === dragId) return;
  e.preventDefault();
  clearDropMarks();
  const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
  li.classList.add(after ? "drop-after" : "drop-before");
});
mine.addEventListener("drop", (e) => {
  const li = e.target.closest("li");
  if (!dragId || !li) return;
  e.preventDefault();
  const after = li.classList.contains("drop-after");
  clearDropMarks();
  // Only the order changes; pinned stores still sort above unpinned ones.
  const ids = [...mine.children].map((el) => el.dataset.id).filter((id) => id !== dragId);
  ids.splice(ids.indexOf(li.dataset.id) + (after ? 1 : 0), 0, dragId);
  saveSettings({ order: ids });
});

// ── Rows ─────────────────────────────────────────────────────────────────
for (const s of STORES) {
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.dataset.id = s.id;
  const link = row.querySelector(".store-link");
  link.textContent = s.name;
  link.href = s.url;
  link.title = `Open ${s.name} coupons`;
  row.querySelector(".enabled").addEventListener("change", (e) => {
    saveSettings({ enabled: { ...settings.enabled, [s.id]: e.target.checked } });
  });
  row.querySelector(".pin").addEventListener("click", () => {
    const pinned = { ...settings.pinned };
    if (pinned[s.id]) delete pinned[s.id];
    else pinned[s.id] = true;
    saveSettings({ pinned });
  });
  row.querySelector(".run").addEventListener("click", () => chrome.runtime.sendMessage({ type: "run", store: s.id }));
  rows[s.id] = row;
}
runAll.addEventListener("click", () => chrome.runtime.sendMessage({ type: "run" }));
daily.addEventListener("change", () => saveSettings({ daily: daily.checked }));
dailyHour.addEventListener("change", () => saveSettings({ dailyHour: dailyHour.value === "" ? null : Number(dailyHour.value) }));
notify.addEventListener("change", () => saveSettings({ notify: notify.checked }));
document.getElementById("accept").addEventListener("click", () => saveSettings({ acknowledged: true }));

// ── "Update available" notice ─────────────────────────────────────────────
// Installs from GitHub don't update themselves, so the popup compares this
// version with the latest release (checked at most every 6 hours). Chrome Web
// Store installs update on their own (Chrome adds update_url to their
// manifest), so they skip the check.
const RELEASES = "https://api.github.com/repos/MrClumzy88/couponsweep/releases/latest";
const newer = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
async function checkForUpdate() {
  const { version: installed, update_url } = chrome.runtime.getManifest();
  if (update_url) return;
  let { latestRelease: latest } = await chrome.storage.local.get("latestRelease");
  if (!latest || Date.now() - latest.checkedAt > 6 * 60 * 60 * 1000) {
    try {
      const r = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
      if (r.ok) {
        const j = await r.json();
        latest = { version: String(j.tag_name || "").replace(/^v/, ""), url: j.html_url, checkedAt: Date.now() };
        await chrome.storage.local.set({ latestRelease: latest });
      }
    } catch {}
  }
  if (latest?.version && newer(latest.version, installed)) {
    const link = document.getElementById("update");
    link.href = latest.url;
    link.textContent = `Update available: version ${latest.version} (you have ${installed}) →`;
    link.hidden = false;
  }
}
checkForUpdate();

const refresh = async () => {
  const data = await chrome.storage.local.get(["settings", "results", "live", "history"]);
  settings = data.settings || {};
  render(data);
};
chrome.storage.onChanged.addListener(refresh);
refresh();

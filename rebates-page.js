// The rebates page (rebates.html), opened from the popup. Shows the last
// "Find my rebates" result (storage key `rebates`, from background.js) as a
// to-do list, a "before you shop" table of deals per item, and the apps.
// The run itself is the background's "ibotta" store run; its progress is in
// `live.ibotta` and its last result in `results.ibotta`.

import { STORES, sortStores } from "./stores.js";
import { ibottaStoreUrl, IBOTTA_ALL_GROCERY, CHECKOUT51, FETCH } from "./rebates.js";
import { C51_UPLOAD } from "./checkout51.js";
import { buildTodos, day } from "./rebate-todos.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
const IBOTTA = STORES.find((s) => s.id === "ibotta");
let state = { settings: {}, rebates: null, results: {}, live: null, rebateDone: {}, rebateStep: null };

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  chrome.storage.local.set({ settings: state.settings });
  chrome.runtime.sendMessage({ type: "settings-changed" });
}
const setDone = (key, on) => {
  const rebateDone = { ...state.rebateDone };
  if (on) rebateDone[key] = true; else delete rebateDone[key];
  chrome.storage.local.set({ rebateDone });
};
const ibottaOn = () => !!state.settings.riskAccepted?.ibotta;

// "by Sat, Nov 21", or "today" / "tomorrow" in bold when it's close.
function dueText(due) {
  if (!due) return el("span", { textContent: "before your next trip" });
  const days = Math.floor((new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (days <= 1) return el("span", { className: "due-soon", textContent: days <= 0 ? "⏰ due today" : "⏰ due tomorrow" });
  return el("span", { textContent: `by ${day(due)}` });
}

// ── To do ────────────────────────────────────────────────────────────────
async function act(t, btn) {
  const a = t.action;
  if (a.kind === "c51") {
    if (a.receipt.tx && a.receipt.host) {
      btn.disabled = true;
      btn.textContent = "Taking the receipt picture…";
      const r = await chrome.runtime.sendMessage({ type: "c51-prepare", tx: a.receipt.tx, host: a.receipt.host, ids: a.ids, label: t.title });
      btn.disabled = false;
      btn.textContent = r?.error ? "Try again" : a.label;
      if (r?.error) alert(r.error);
      return;
    }
    await chrome.storage.local.set({ c51Prefill: { ids: a.ids, label: t.title, at: Date.now() } });
    chrome.tabs.create({ url: C51_UPLOAD });
  } else if (a.kind === "cc") {
    await chrome.storage.local.set({ ccPrefill: { ids: a.ids, at: Date.now() } });
    chrome.tabs.create({ url: "https://www.coupons.com/printable" });
  }
}

function todoItem(t) {
  const tick = el("input", { type: "checkbox", className: "tick", checked: t.done, title: "Done" });
  tick.setAttribute("aria-label", `Mark done: ${t.title}`);
  tick.addEventListener("change", () => {
    if (t.checklist) {
      const rebateDone = { ...state.rebateDone };
      for (const c of t.checklist) { if (tick.checked) rebateDone[c.key] = true; else delete rebateDone[c.key]; }
      chrome.storage.local.set({ rebateDone });
    } else setDone(t.key, tick.checked);
  });
  const body = el("div", {},
    el("div", { className: "meta" }, el("span", { className: "app", textContent: t.app }), dueText(t.due), ` · ${t.worth}`),
    el("div", { className: "head", textContent: t.title }));
  if (t.lines?.length) body.append(el("ul", {}, ...t.lines.map((l) => el("li", { textContent: l }))));
  if (t.checklist) {
    body.append(el("ul", { className: "checklist" }, ...t.checklist.map((c) => {
      const box = el("input", { type: "checkbox", checked: !!state.rebateDone[c.key] });
      box.addEventListener("change", () => setDone(c.key, box.checked));
      return el("li", {}, el("label", {}, box, c.text));
    })));
  }
  if (t.note) body.append(el("p", { className: "note", textContent: t.note }));
  let right = el("span");
  if (t.action && !t.done) {
    right = el("button", { className: "act primary", textContent: `${t.action.label} →` });
    right.addEventListener("click", () => act(t, right));
  }
  return el("li", { className: `todo${t.done ? " done" : ""}` }, tick, body, right);
}

function renderTodos() {
  const todos = buildTodos(state.rebates, state.rebateDone);
  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  $("todo-count").textContent = state.rebates ? `(${open.length})` : "";
  $("todo").replaceChildren(...(open.length ? open.map(todoItem)
    : [el("li", { className: "todo" }, el("span"), el("div", { textContent: state.rebates ? "Nothing to do right now. ✓" : "Press Find my rebates to start." }), el("span"))]));
  $("done-box").hidden = !done.length;
  $("done-title").textContent = `Done (${done.length})`;
  $("done").replaceChildren(...done.map(todoItem));
}

// ── Before you shop ──────────────────────────────────────────────────────
const SOURCES = ["coupons.com", "Checkout 51", "Ibotta"];
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
function renderStacks() {
  const stacks = state.rebates?.stacks || [];
  $("stacks-empty").hidden = !!stacks.length || !state.rebates;
  $("stacks").hidden = !stacks.length;
  $("stacks").tBodies[0].replaceChildren(...stacks.map((s) => {
    const cells = SOURCES.map((src) => {
      const deals = s.deals.filter((d) => d.source === src);
      if (!deals.length) {
        return src === "Ibotta" && !ibottaOn() ? el("td", {}, el("span", { className: "off", textContent: "off" })) : el("td", {}, el("span", { className: "none", textContent: "—" }));
      }
      return el("td", {}, ...deals.flatMap((d, i) => [i ? el("br") : null, el("a", { href: d.url, target: "_blank", rel: "noopener", textContent: d.value, title: d.name })]).filter(Boolean));
    });
    const star = s.deals.length > 1 ? "★ " : "";
    return el("tr", {}, el("td", { textContent: `${star}${title(s.item)}` }), ...cells, el("td", { className: "num", textContent: `$${s.total.toFixed(2)}` }));
  }));
}

// ── Maybe ────────────────────────────────────────────────────────────────
function renderMaybe() {
  const r = state.rebates;
  const all = r ? [
    ...(r.usual || []).map((m) => ({ ...m, src: "Ibotta" })),
    ...(r.receipts || []).flatMap((x) => x.hits.map((h) => ({ ...h, src: "Ibotta" }))),
    ...(r.c51?.usual || []).map((m) => ({ ...m, src: "Checkout 51" })),
    ...(r.c51?.receipts || []).flatMap((x) => x.hits.map((h) => ({ ...h, src: "Checkout 51" }))),
  ].filter((m) => m.level === "possible") : [];
  const seen = new Set();
  const list = all.filter((m) => { const k = `${m.src}:${m.offer.id}`; return !seen.has(k) && seen.add(k); });
  $("maybe-box").hidden = !list.length;
  $("maybe-title").textContent = `Maybe: check these yourself (${list.length})`;
  $("maybe").replaceChildren(...list.map((m) => el("li", {},
    el("a", { href: m.offer.url, target: "_blank", rel: "noopener", textContent: `${m.src}: ${m.offer.value} · ${m.offer.name}` }),
    el("div", { className: "why", textContent: `For ${(m.items[0] || "?").toLowerCase()}. ${m.why}` }))));
}

// ── Apps ─────────────────────────────────────────────────────────────────
$("c51-link").href = CHECKOUT51;
$("fetch-link").href = FETCH;
function renderApps() {
  $("ibotta-state").textContent = ibottaOn() ? "Auto-add on" : "Auto-add off";
  $("ibotta-toggle").textContent = ibottaOn() ? "Turn auto-add off" : "Turn auto-add on…";
  const mine = sortStores(STORES, state.settings).filter((s) => state.settings.enabled?.[s.id] && ibottaStoreUrl(s.id));
  $("ibotta-links").replaceChildren(
    ...mine.map((s) => el("a", { href: ibottaStoreUrl(s.id), target: "_blank", rel: "noopener", textContent: `${s.name} →` })),
    el("a", { href: IBOTTA_ALL_GROCERY, target: "_blank", rel: "noopener", textContent: mine.length ? "Other stores →" : "Find your store →" }));
}
$("ibotta-toggle").addEventListener("click", () => {
  if (ibottaOn()) {
    const riskAccepted = { ...state.settings.riskAccepted };
    delete riskAccepted.ibotta;
    saveSettings({ riskAccepted });
  } else showRisk();
});

// The Ibotta warning: covers the page until answered; needs the box ticked.
function showRisk() {
  $("risk-check").checked = false;
  $("risk-accept").disabled = true;
  $("risk").hidden = false;
  $("risk-cancel").focus();
}
$("risk-check").addEventListener("change", () => { $("risk-accept").disabled = !$("risk-check").checked; });
$("risk-cancel").addEventListener("click", () => { $("risk").hidden = true; });
$("risk-accept").addEventListener("click", () => {
  saveSettings({ riskAccepted: { ...state.settings.riskAccepted, [IBOTTA.id]: Date.now() } });
  $("risk").hidden = true;
});

// ── Header ───────────────────────────────────────────────────────────────
$("find").addEventListener("click", () => {
  const running = state.live && typeof state.live === "object" ? state.live.ibotta : null;
  chrome.runtime.sendMessage(running ? { type: "stop", store: "ibotta" } : { type: "run", store: "ibotta" });
});
$("accept").addEventListener("click", () => saveSettings({ acknowledged: true }));
// The run box: each step with ✓ (done), ▶ (now) or ○ (waiting) while it
// runs; afterwards a plain "Done" or "Didn't finish" and what to do next.
const STEPS = [
  "Read your store receipts",
  "Check Checkout 51 and coupons.com",
  "Read the Ibotta offers for your stores",
  "Add the Ibotta offers that match",
];
const NEXT = {
  login: "Sign in to that site in another tab, then press Find my rebates again.",
  blocked: "The site is blocking for now. Try again in an hour.",
  error: "Press Find my rebates to try again. If it fails twice, close any Albertsons and Ibotta tabs first.",
  stopped: "You stopped it. Press Find my rebates to start over.",
};
function renderRunBox(running) {
  const r = state.results?.ibotta;
  const box = $("runbox");
  box.hidden = !running && !r;
  if (box.hidden) return;
  const steps = state.rebateStep?.ibottaOn === false ? STEPS.slice(0, 2) : STEPS;
  if (running) {
    const now = state.rebateStep?.n || 1;
    box.className = "card runbox busy";
    $("run-title").textContent = "Working… you can leave this page open or close it.";
    $("run-steps").replaceChildren(...steps.map((s, i) => {
      const k = i + 1 < now ? "done" : i + 1 === now ? "now" : "";
      return el("li", { className: k }, el("span", { className: "mark", textContent: k === "done" ? "✓" : k === "now" ? "▶" : "○" }), s);
    }));
    $("run-steps").hidden = false;
    $("run-detail").textContent = `Right now: ${running}`;
    return;
  }
  const ok = r.status === "ok";
  box.className = `card runbox ${ok ? "ok" : "bad"}`;
  $("run-title").textContent = ok ? `✓ Done (${ago(r.at)})` : `⚠ Didn't finish (${ago(r.at)})`;
  $("run-steps").hidden = true;
  const detail = [el("span", { textContent: r.message || "" })];
  if (ok) {
    // Name the matches here, so nobody has to find them in the table.
    const stacks = state.rebates?.stacks || [];
    detail.push(el("span", { className: "todo-hint", textContent: stacks.length ? `Matches on things you buy (${stacks.length}):` : "No exact matches on things you buy this time." }));
    if (stacks.length) {
      detail.push(el("ul", { className: "run-matches" }, ...stacks.map((s) => el("li", {},
        `${title(s.item)}: `,
        ...s.deals.flatMap((d, i) => [i ? " + " : null, el("a", { href: d.url, target: "_blank", rel: "noopener", textContent: `${d.value} (${d.source})` })]).filter(Boolean)))));
    }
    const open = buildTodos(state.rebates, state.rebateDone).filter((t) => !t.done).length;
    detail.push(el("span", { className: "todo-hint", textContent: open ? `You have ${open} thing${open === 1 ? "" : "s"} to do, listed under To do.` : "Nothing for you to do right now." }));
  }
  else {
    detail.push(el("span", { className: "todo-hint", textContent: NEXT[r.status] || NEXT.error }));
    if (state.rebates?.at) detail.push(el("span", { className: "todo-hint", textContent: `The list below is from your last good run, ${ago(state.rebates.at)}.` }));
  }
  $("run-detail").replaceChildren(...detail);
}

function renderHeader() {
  const running = state.live && typeof state.live === "object" ? state.live.ibotta : null;
  $("notice").hidden = !!state.settings.acknowledged;
  $("find").disabled = !state.settings.acknowledged;
  $("find").textContent = running ? "■ Stop" : "Find my rebates";
  renderRunBox(running);
  $("empty").hidden = !!state.rebates;
}

function render() {
  renderHeader();
  renderTodos();
  renderStacks();
  renderMaybe();
  renderApps();
}

async function refresh() {
  const d = await chrome.storage.local.get(["settings", "rebates", "results", "live", "rebateDone", "rebateStep"]);
  state = { settings: d.settings || {}, rebates: d.rebates || null, results: d.results || {}, live: d.live || null, rebateDone: d.rebateDone || {}, rebateStep: d.rebateStep || null };
  render();
}
chrome.storage.onChanged.addListener(refresh);
refresh();

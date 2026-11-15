// Turns the last "Find my rebates" result (storage key `rebates`, written by
// background.js) into a to-do list: one item per thing the user has to do,
// soonest deadline first. Shared by the rebates page and the popup's summary.
// Ticks are kept in storage under `rebateDone` ({ <key>: true }).

export const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const sum = (hits) => hits.reduce((n, h) => n + (Number(h.offer.amount) || 0), 0);
const exactOf = (hits = []) => hits.filter((h) => h.level === "exact");

export function buildTodos(rebates, done = {}) {
  if (!rebates) return [];
  const now = Date.now();
  const todos = [];

  // Checkout 51: upload this week's receipts that have matches.
  for (const x of rebates.c51?.receipts || []) {
    const hits = exactOf(x.hits);
    if (!hits.length || x.deadline <= now) continue;
    todos.push({
      key: `c51:${x.receipt.id}`, app: "Checkout 51", due: x.deadline,
      title: `Upload your ${x.receipt.store} receipt from ${day(Date.parse(x.receipt.at))}`,
      worth: `${money(sum(hits))} cash back`,
      lines: hits.map((h) => `${h.offer.value} · ${h.offer.name}`),
      action: { kind: "c51", receipt: x.receipt, ids: hits.map((h) => h.offer.id), label: "Fill in Checkout 51" },
    });
  }

  // Ibotta: receipts to scan in the app (only needed without a linked card).
  for (const x of rebates.ibottaOff ? [] : rebates.receipts || []) {
    const hits = exactOf(x.hits);
    if (!hits.length || x.deadline <= now) continue;
    todos.push({
      key: `ibotta:${x.receipt.id}`, app: "Ibotta", due: x.deadline,
      title: `Scan your ${x.receipt.store} receipt from ${day(Date.parse(x.receipt.at))} in the Ibotta app`,
      worth: `${money(sum(hits))} cash back`,
      lines: hits.map((h) => `${h.offer.value} · ${h.offer.name}`),
      note: "Skip this if your store card is linked in Ibotta: it pays on its own.",
    });
  }

  // Fetch: one item for every receipt still inside its 14-day window.
  const fetchOpen = (rebates.fetch || []).filter((r) => r.deadline > now);
  if (fetchOpen.length) {
    const left = fetchOpen.filter((r) => !done[`fetch:${r.id}`]);
    const n = left.length || fetchOpen.length;
    todos.push({
      key: "fetch", app: "Fetch", due: Math.min(...(left.length ? left : fetchOpen).map((r) => r.deadline)),
      title: `Scan ${n} receipt${n === 1 ? "" : "s"} in the Fetch app`,
      worth: "points on every receipt",
      checklist: fetchOpen.map((r) => ({ key: `fetch:${r.id}`, text: `${r.store}, ${day(Date.parse(r.at))} · ${money(r.total)} · by ${day(r.deadline)}` })),
    });
  }

  // coupons.com: print the matching coupons before the next trip.
  const cc = rebates.couponsCom?.usual || [];
  if (cc.length) {
    todos.push({
      key: `cc:${cc.map((m) => m.offer.id).sort().join(",")}`, app: "coupons.com", due: null,
      title: `Print ${cc.length} coupon${cc.length === 1 ? "" : "s"} before you shop`,
      worth: `${money(sum(cc))} off`,
      lines: cc.map((m) => `${m.offer.value} · ${m.offer.name} (you buy ${m.items[0].toLowerCase()})`),
      action: { kind: "cc", ids: cc.map((m) => m.offer.id), label: "Clip them and print" },
    });
  }

  for (const t of todos) {
    t.done = t.checklist ? t.checklist.every((c) => done[c.key]) : !!done[t.key];
  }
  return todos.sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)));
}

// One line for the popup: "3 to do · 2 stacks".
export function summary(rebates, done = {}) {
  if (!rebates) return null;
  const open = buildTodos(rebates, done).filter((t) => !t.done).length;
  const stacks = (rebates.stacks || []).filter((s) => s.deals.length > 1).length;
  const deals = (rebates.stacks || []).length;
  return { open, stacks, deals };
}

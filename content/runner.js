// Page-world runner shared by every store adapter.
//
// An adapter is { id, name, isCouponPage(), run(ctx) }. `run` lists the
// store's offers through the site's own API, clips the unclipped ones with
// ctx.clip(), and returns nothing; the runner keeps the counts. Adapters
// throw ctx.fail("login" | "blocked" | "error", message) to stop early.
// When an adapter knows what an offer is worth, it passes the dollar amount
// to ctx.clip() (ctx.dollarsOff() reads it from offer text); the runner adds
// up the clipped ones for the popup's savings total.

(() => {
  if (window.__gbc) return;

  const between = (min, max) => min + Math.random() * (max - min);

  // The dollar amount an offer takes off, from its text ("$1.50 off",
  // "Save $2", "$5 ExtraBucks", "Get $3 Walmart Cash"), or 0 when there isn't
  // a clear one: percent offers, prices on their own and anything odd count
  // for nothing, so the total is a floor. Takes strings or offer objects (reads their top-level
  // string fields).
  const OFF = [
    /\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:off|extrabucks|(?:in\s+)?walmart cash)\b/i,
    /\bsave\s+\$\s?(\d{1,3}(?:\.\d{1,2})?)/i,
  ];
  function dollarsOff(...sources) {
    const texts = sources.flatMap((s) =>
      typeof s === "string" ? [s] : s && typeof s === "object" ? Object.values(s).filter((v) => typeof v === "string") : []);
    for (const re of OFF) {
      for (const t of texts) {
        const v = Number(t.match(re)?.[1]);
        if (v > 0 && v < 100) return v;
      }
    }
    return 0;
  }

  // Chrome throttles timers in background tabs (to about once a minute after
  // five minutes hidden), which would stall the daily run in its background
  // tab. So pauses are timed by the extension's service worker via the bridge;
  // the local timer is only a fallback for when the bridge doesn't answer.
  let sleepSeq = 0;
  const wakers = new Map();
  window.addEventListener("gbc:wake", (e) => wakers.get(Number(e.detail))?.());
  function sleep(ms) {
    return new Promise((resolve) => {
      const id = ++sleepSeq;
      const finish = () => { if (wakers.delete(id)) resolve(); };
      wakers.set(id, finish);
      emit("gbc:sleep", { id, ms });
      setTimeout(finish, ms);
    });
  }

  class StopRun extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  let adapter = null;
  let running = false;
  let stopRequested = false;

  function emit(type, data) {
    window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
  }

  // ── On-page panel ──────────────────────────────────────────────────────
  let panel = null;
  function showPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "gbc-panel";
    panel.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:280px;" +
      "background:#1d2430;color:#eef2f6;border-radius:12px;padding:14px 16px;" +
      "font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.35)";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;margin-bottom:6px";
    title.textContent = `CouponSweep · ${adapter.name}`;
    const msg = document.createElement("div");
    msg.dataset.role = "msg";
    const bar = document.createElement("div");
    bar.style.cssText = "height:6px;background:#334155;border-radius:3px;margin:10px 0;overflow:hidden";
    const fill = document.createElement("div");
    fill.dataset.role = "fill";
    fill.style.cssText = "height:100%;width:0;background:#22c55e;transition:width .2s";
    bar.append(fill);
    const btn = document.createElement("button");
    btn.dataset.role = "btn";
    btn.textContent = "Stop";
    btn.style.cssText =
      "background:#475569;color:#fff;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit";
    btn.onclick = () => {
      if (running) stopRequested = true;
      else { panel.remove(); panel = null; }
    };
    const note = document.createElement("div");
    note.style.cssText = "margin-top:10px;font-size:12px;color:#94a3b8";
    note.textContent = "Unofficial; not affiliated with any store. Automated clipping may go against the store's terms. Use at your own risk.";
    panel.append(title, msg, bar, btn, note);
    document.body.append(panel);
    return panel;
  }
  // A clean finish needs nothing from the user, so the panel marks itself done
  // and fades out (hovering keeps it). Anything else stays until closed.
  function autoDismiss() {
    const p = panel;
    p.firstElementChild.textContent = `✓ ${p.firstElementChild.textContent}`;
    p.style.transition = "opacity .6s";
    let hovered = false;
    p.addEventListener("mouseenter", () => { hovered = true; p.style.opacity = "1"; });
    p.addEventListener("mouseleave", () => { hovered = false; fade(); });
    const fade = () => setTimeout(() => {
      if (hovered || panel !== p) return;
      p.style.opacity = "0";
      setTimeout(() => { if (!hovered && panel === p) { p.remove(); panel = null; } }, 700);
    }, 8000);
    fade();
  }

  function setPanel(text, fraction) {
    const p = showPanel();
    p.querySelector('[data-role="msg"]').textContent = text;
    if (fraction != null) p.querySelector('[data-role="fill"]').style.width = `${Math.round(fraction * 100)}%`;
  }

  // ── Floating "Clip all" button on coupon pages ─────────────────────────
  function syncFab() {
    const want = adapter && !running && !panel && adapter.isCouponPage();
    let fab = document.getElementById("gbc-fab");
    if (!want) { fab?.remove(); return; }
    if (fab) return;
    fab = document.createElement("button");
    fab.id = "gbc-fab";
    fab.textContent = "✂ Clip all coupons";
    fab.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#16a34a;color:#fff;" +
      "border:0;border-radius:999px;padding:12px 18px;cursor:pointer;" +
      "font:600 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.3)";
    fab.onclick = () => {
      // Nothing runs until the user has accepted the notice in the popup
      // (content/bridge.js mirrors that flag onto the page).
      if (document.documentElement.dataset.gbcAck === "1") return run({ auto: false });
      setPanel("Open the CouponSweep button in Chrome's toolbar and read the notice there first.");
      panel.querySelector('[data-role="btn"]').textContent = "Close";
      syncFab();
    };
    document.body.append(fab);
  }

  // ── Run ────────────────────────────────────────────────────────────────
  async function run({ auto }) {
    if (running || !adapter) return;
    running = true;
    stopRequested = false;
    document.getElementById("gbc-fab")?.remove();

    const result = { store: adapter.id, status: "ok", total: 0, already: 0, clipped: 0, failed: 0, savings: 0, message: "", auto };
    const report = (text) => {
      const todo = result.total - result.already;
      const done = result.clipped + result.failed;
      setPanel(text, todo > 0 ? done / todo : null);
      emit("gbc:progress", { ...result, text });
    };

    const ctx = {
      sleep,
      between,
      dollarsOff,
      fail: (status, message) => new StopRun(status, message),
      // Adapters call these as they discover offers.
      found(total, already) {
        result.total = total;
        result.already = already;
        report(`Found ${total} offers, ${already} already clipped.`);
      },
      // Clips one offer with a human-ish pause first. `fn` returns true on
      // success, false (or throws) on a per-offer failure. Throwing a StopRun
      // ends the whole run. `value` is the offer's dollar amount, if known.
      async clip(fn, gap = [400, 900], value = 0) {
        if (stopRequested) throw new StopRun("stopped", "Stopped.");
        await sleep(between(gap[0], gap[1]));
        let ok = false;
        try { ok = await fn(); } catch (e) { if (e instanceof StopRun) throw e; console.log("[CouponSweep] clip error", e); }
        if (ok) {
          result.clipped++;
          if (Number.isFinite(value) && value > 0 && value < 100) result.savings += value;
        } else result.failed++;
        report(`Clipping… ${result.clipped} clipped${result.failed ? `, ${result.failed} failed` : ""}.`);
        return ok;
      },
      status: (text) => report(text),
      // For long stretches with nothing to clip (paging, moving between lists).
      checkStop() { if (stopRequested) throw new StopRun("stopped", "Stopped."); },
    };

    try {
      report("Looking up offers…");
      await adapter.run(ctx);
      const left = result.total - result.already;
      result.message = left === 0
        ? `All ${result.total} offers were already clipped.`
        : `Clipped ${result.clipped} of ${left} new offers${result.failed ? ` (${result.failed} failed)` : ""}.`;
    } catch (e) {
      if (e instanceof StopRun) {
        result.status = e.status;
        result.message = result.clipped ? `Clipped ${result.clipped}. ${e.message}` : e.message;
      } else {
        result.status = "error";
        result.message = `Something went wrong: ${e?.message || e}`;
        console.error("[CouponSweep]", e);
      }
    }

    running = false;
    setPanel(result.message, result.status === "ok" ? 1 : null);
    const btn = panel.querySelector('[data-role="btn"]');
    btn.textContent = "Close";
    if (result.status === "ok") autoDismiss();
    emit("gbc:done", result);
  }

  window.__gbc = {
    register(a) {
      adapter = a;
      document.documentElement.dataset.gbcReady = "1";
      syncFab();
      // Single-page sites change routes without reloading.
      let t = null;
      new MutationObserver(() => { clearTimeout(t); t = setTimeout(syncFab, 300); })
        .observe(document.body, { childList: true, subtree: true });
    },
  };

  window.addEventListener("gbc:run", (e) => {
    let opts = {};
    try { opts = JSON.parse(e.detail); } catch {}
    run(opts);
  });
})();

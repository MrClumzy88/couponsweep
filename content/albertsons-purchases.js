// Reads your in-store receipts on Albertsons-family sites (Albertsons, Tom
// Thumb, Safeway… all share one account system), for the rebate matcher.
//
// Runs at document_start on /order-account/ pages, in the page's own world.
// The purchases page (/order-account/orders) loads its list with
// POST /order-account/api/instore {params:{clubcard}, token}; a receipt's items
// come from the same call with params.id set. The body carries the page's
// sign-in token, so this keeps the page's own request body in memory (never
// stored or sent anywhere else) and reuses it, one receipt at a time.
//
// The extension asks for a sync with the gbc:sync-purchases event (from
// content/bridge.js) and gets gbc:purchases back.

(() => {
  if (window.__gbcPurchases) return;
  window.__gbcPurchases = true;
  let template = null; // { url, body } of the page's own /api/instore request

  const fetch_ = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url;
      if (/\/order-account\/api\/instore$/.test(new URL(url, location.href).pathname) && typeof init?.body === "string" && !template) {
        const body = JSON.parse(init.body);
        if (body?.params?.clubcard && body.token) template = { url, body };
      }
    } catch {}
    return fetch_.apply(this, arguments);
  };

  const emit = (type, data) => window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
  const pause = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

  async function call(params) {
    const body = { ...template.body, params: { clubcard: template.body.params.clubcard, ...params } };
    const r = await fetch_.call(window, template.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // Sale lines only; leaves out coupons and markers like "35% OFF FRESH ITEMS".
  const compact = (list, detail) => ({
    id: list._id,
    tx: detail?.transactionId || null, // In the receipt-details page's URL.
    // The site writes local store time with a "Z"; drop it so it reads as local.
    at: String(list.posDateTime || "").replace(/(\.\d+)?Z$/, ""),
    banner: list.banner,
    store: list.storeName,
    total: Number(list.finalTotal) || 0,
    items: (detail?.items || [])
      .filter((i) => i.lineItemType === "Sale" && Number(i.regularPriceTotal) > 0.01 && !/^cpn /i.test(i.name || ""))
      .map((i) => ({ name: (i.name || "").replace(/\s+/g, " ").trim(), upc: i.id, qty: i.quantity, price: Number(i.reducedPriceTotal) || 0, dept: i.department })),
  });

  window.addEventListener("gbc:sync-purchases", async (e) => {
    let req = {};
    try { req = JSON.parse(e.detail); } catch {}
    const known = new Set(req.known || []);
    const days = req.days || 120;
    try {
      for (let t = 0; !template && t < 40; t++) {
        if (/sign-in/.test(location.pathname)) break;
        await pause(500, 500);
      }
      if (!template) return emit("gbc:purchases", { error: "login", message: "Sign in to see your purchases, then try again." });

      const list = (await call({})).receipts || [];
      const cutoff = Date.now() - days * 864e5;
      const wanted = list.filter((r) => r.source === "INSTORE" && Date.parse(r.posDateTime) >= cutoff && !known.has(r._id));
      const receipts = [];
      for (const r of wanted) {
        await pause(600, 1200);
        try {
          const detail = (await call({ id: r._id })).receipts?.[0];
          receipts.push(compact(r, detail));
        } catch (err) {
          console.log("[CouponSweep] receipt", r._id, err);
        }
        emit("gbc:purchases-progress", { done: receipts.length, of: wanted.length });
      }
      emit("gbc:purchases", { receipts, listed: list.length });
    } catch (err) {
      emit("gbc:purchases", { error: "error", message: `Couldn't read purchases: ${err?.message || err}` });
    }
  });
})();

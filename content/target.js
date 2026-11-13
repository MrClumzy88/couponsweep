// Target Circle adapter.
//
// Most Target Circle deals now apply automatically at checkout; only the
// "Coupons to apply" offers (deals page, facet=tap_to_apply) need saving.
//
// Listing: redsky's recommended-promotions endpoint for that grid, paged with
// `page_token`. Each offer carries `added` (already saved) and `auto_applied`.
// Saving: POST loyalty_guest_offerlists/v1/external/<offerId>, the same call
// the site's Save button makes.
//
// Target's bot protection (PerimeterX) answers fast bursts with HTTP 435 and a
// CAPTCHA page, so this adapter is deliberately slow and stops on the first one.

(() => {
  const FALLBACK = {
    redskyBase: "https://redsky.target.com",
    redskyKey: "9f36aeafbe60771e321a7cc95a78140772ab3e96",
    apiBase: "https://api.target.com",
    apiKey: "a5ae7fb188e78581614e4909f407462d8392b977",
    clientKey: "NX1a8HGstVgSEONL1pMdNw==",
    savePath: "loyalty_guest_offerlists/v1/external",
  };

  function config() {
    const s = window.__CONFIG__?.services || {};
    const api = s.apiPlatform || {};
    const keys = api.circleOfferLoyaltyKeys || {};
    return {
      redskyBase: s.redskyAggregations?.baseUrl || s.redsky?.baseUrl || FALLBACK.redskyBase,
      redskyKey: s.redskyAggregations?.apiKey || s.redsky?.apiKey || window.__CONFIG__?.defaultServicesApiKey || FALLBACK.redskyKey,
      apiBase: (api.baseUrl || FALLBACK.apiBase).replace(/\/$/, ""),
      apiKey: keys.loyaltyApiKey || FALLBACK.apiKey,
      clientKey: keys.loyaltyClientKey || FALLBACK.clientKey,
      savePath: (api.apis?.loyaltyGuestOfferLists?.endpointPaths?.postOfferV1 || FALLBACK.savePath).replace(/^\//, ""),
    };
  }

  function cookie(name) {
    const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
  }

  // The store the site is pricing for, e.g. fiatsCookie = "DSI_1234|DSN_…".
  const storeId = () => (cookie("fiatsCookie").match(/DSI_(\d+)/) || [])[1] || "";

  async function getJson(url, ctx) {
    const r = await fetch(url, { credentials: "include" });
    const text = await r.text();
    if (r.status === 435 || /px-captcha/.test(text)) {
      throw ctx.fail("blocked", "Target wants a quick human check. Reload the deals page, complete it if asked, then run again.");
    }
    if (!r.ok) throw ctx.fail("error", `Target's offer list failed (HTTP ${r.status}).`);
    return JSON.parse(text);
  }

  window.__gbc.register({
    id: "target",
    name: "Target Circle",
    isCouponPage: () => location.pathname.startsWith("/deals") || location.pathname.startsWith("/circle"),

    async run(ctx) {
      const cfg = config();
      const store = storeId();
      const visitor = cookie("visitorId");
      if (!store || !visitor) throw ctx.fail("error", "Couldn't tell which Target store you use. Open target.com, pick your store, then run again.");

      const params = new URLSearchParams({
        key: cfg.redskyKey,
        visitor_id: visitor,
        placement_id: "deals_offer_grid_tap",
        pricing_store_id: store,
        page: "/deals/all",
        channel: "WEB",
        purchasable_store_ids: store,
      });
      const listUrl = `${cfg.redskyBase}/redsky_aggregations/v1/web/get_circle_noncircle_recommended_promotions_v1?${params}`;

      const offers = new Map();
      let token = null;
      for (let page = 0; page < 40; page++) {
        const json = await getJson(listUrl + (token ? `&page_token=${encodeURIComponent(token)}` : ""), ctx);
        const deals = json?.data?.recommended_deals;
        let fresh = 0;
        for (const d of deals?.deals || []) {
          const o = d.circle_offer;
          if (o?.id && !offers.has(o.id)) { offers.set(o.id, o); fresh++; }
        }
        ctx.status(`Loading offers… ${offers.size} so far`);
        token = deals?.pagination?.next_token;
        if (!token || !fresh) break;
        await ctx.sleep(ctx.between(1200, 2200));
      }

      const all = [...offers.values()].filter((o) => o.offer_status === "active");
      const todo = all.filter((o) => !o.added && !o.auto_applied);
      ctx.found(all.length, all.length - todo.length);

      let failStreak = 0;
      for (const o of todo) {
        const ok = await ctx.clip(async () => {
          const url = `${cfg.apiBase}/${cfg.savePath}/${o.id}?location_id=${encodeURIComponent(store)}`;
          const r = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { Authorization: cfg.clientKey, "x-api-key": cfg.apiKey },
          });
          if (r.status === 401 || r.status === 403) throw ctx.fail("login", "Sign in to target.com first, then run again.");
          if (r.status === 435) throw ctx.fail("blocked", "Target wants a quick human check. Reload the deals page, complete it if asked, then run again.");
          if (!r.ok) console.log("[CouponSweep] Target save failed", o.id, r.status, await r.text().catch(() => ""));
          return r.ok;
        }, [900, 1800], ctx.dollarsOff(o));
        failStreak = ok ? 0 : failStreak + 1;
        // Usually means the saved-offers limit was reached.
        if (failStreak >= 5) throw ctx.fail("error", "Target stopped accepting saves (you may have hit its saved-offer limit).");
      }
    },
  });
})();

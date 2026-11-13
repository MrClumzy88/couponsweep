// Kroger-family adapter: Kroger, Ralphs, Fry's, King Soopers, Fred Meyer,
// Smith's, QFC, Dillons and the other banners share one coupon API.
//
// Listing: GET /atlas/v1/savings-coupons/v2/coupons, 72 per page by offset.
// Each coupon has `addedToCard` (already clipped) and `canBeAddedToCard`.
// Clipping: POST /atlas/v1/savings-coupons/v1/clip-unclip {action, couponId}.
// Both need the store/location headers the site itself sends, which
// content/kroger-context.js records as the page loads.
//
// Kroger caps how many coupons a card can hold, so the most valuable coupons
// go first and the run stops cleanly when the card is full.

(() => {
  const API = "/atlas/v1/savings-coupons";
  const PAGE = 72;
  const BLOCKED = "Kroger started refusing requests. Wait a while, reload the coupons page, and run again.";

  // Headers.set (not an object spread) so no header can end up duplicated;
  // Kroger rejects merged values like "WEB, WEB".
  function headers() {
    const ctx = window.__gbcKrogerCtx || {};
    if (!ctx["x-laf-object"]) return null;
    const h = new Headers({ Accept: "application/json, text/plain, */*", "Content-Type": "application/json" });
    for (const [name, value] of Object.entries(ctx)) h.set(name, value);
    h.set("x-kroger-channel", "WEB");
    return h;
  }

  const banner = location.hostname.replace(/^www\./, "").split(".")[0];

  window.__gbc.register({
    id: banner,
    name: { kroger: "Kroger", ralphs: "Ralphs", frysfood: "Fry's", kingsoopers: "King Soopers", fredmeyer: "Fred Meyer",
      smithsfoodanddrug: "Smith's", qfc: "QFC", dillons: "Dillons", citymarket: "City Market", bakersplus: "Baker's",
      gerbes: "Gerbes", jaycfoods: "Jay C", "pay-less": "Pay Less", marianos: "Mariano's", picknsave: "Pick 'n Save",
      metromarket: "Metro Market", foodsco: "Foods Co", food4less: "Food 4 Less" }[banner] || banner,
    isCouponPage: () => location.pathname.startsWith("/savings/cl/coupons"),

    async run(ctx) {
      // The site sends its first coupon requests a moment after load.
      let h = headers();
      for (let i = 0; i < 10 && !h; i++) { await ctx.sleep(1000); h = headers(); }
      if (!h) throw ctx.fail("error", "Couldn't read your Kroger store details. Reload the coupons page, wait for coupons to appear, then run again.");

      const coupons = new Map();
      for (let offset = 0; offset < 5000; offset += PAGE) {
        const q = new URLSearchParams([
          ["projections", "coupons.compact"], ["filter.status", "unclipped"], ["filter.status", "active"],
          ["page.size", String(PAGE)], ["page.offset", String(offset)],
        ]);
        const r = await fetch(`${API}/v2/coupons?${q}`, { credentials: "include", headers: h });
        if (r.status === 401) throw ctx.fail("login", "Sign in to Kroger first, then run again.");
        if (r.status === 403 || r.status === 429) throw ctx.fail("blocked", BLOCKED);
        if (!r.ok) throw ctx.fail("error", `Kroger's coupon list failed (HTTP ${r.status}).`);
        const list = (await r.json())?.data?.coupons || [];
        for (const c of list) coupons.set(String(c.id), c);
        ctx.status(`Loading coupons… ${coupons.size} so far`);
        if (list.length < PAGE) break;
        await ctx.sleep(ctx.between(500, 900));
      }

      const all = [...coupons.values()];
      const todo = all
        .filter((c) => !c.addedToCard && c.canBeAddedToCard !== false)
        .sort((a, b) => (Number(b.savings) || 0) - (Number(a.savings) || 0));
      ctx.found(all.length, all.length - todo.length);

      let failStreak = 0;
      for (const c of todo) {
        const ok = await ctx.clip(async () => {
          const r = await fetch(`${API}/v1/clip-unclip`, {
            method: "POST",
            credentials: "include",
            headers: h,
            body: JSON.stringify({ action: "CLIP", couponId: String(c.id) }),
          });
          if (r.status === 401) throw ctx.fail("login", "Your Kroger sign-in expired. Sign in and run again.");
          if (r.status === 403 || r.status === 429) throw ctx.fail("blocked", BLOCKED);
          if (r.ok) return true;
          const text = await r.text().catch(() => "");
          // 422 TooManyCouponsOnCard: "This card already been loaded with maximum number of coupons."
          if (/TooManyCouponsOnCard|maximum number of coupons/i.test(text)) throw ctx.fail("ok", "Your Kroger card is full (Kroger limits how many coupons it holds). The most valuable ones were clipped first.");
          console.log("[CouponSweep] Kroger clip failed", c.id, r.status, text);
          return false;
        }, [600, 1200], Number(c.savings) || ctx.dollarsOff(c));
        failStreak = ok ? 0 : failStreak + 1;
        if (failStreak >= 5) throw ctx.fail("error", "Kroger stopped accepting clips. Your card may be full; check the console for details.");
      }
    },
  });
})();

// Albertsons-family adapter: Albertsons, Tom Thumb, Safeway, Vons, Randalls,
// Jewel-Osco, Acme, the United Family stores and the other banners all share
// the "for U" backend. The banner name the API wants is the second-level
// domain ("safeway", "shopunitedsupermarkets"), same as the site's own
// `AB.userInfo.banner`.
//
// Listing: GET /abs/pub/web/j4u/api/ecomgallery returns every offer across all
// programs in one call (`offers` keyed by offer id, `status` "C" once clipped).
// Clipping: POST /abs/pub/web/j4u/api/offers/clip, one offer per request.
// Both need the shopper token and API client id the page itself loads.
//
// Endpoints and headers follow nathanrcast/clip-all-coupons (MIT).
// The site sits behind Akamai Bot Manager, which blocks bursts ("Access
// Denied / Error 15"), so clips go one at a time with a pause in between.

(() => {
  const API = "/abs/pub/web/j4u/api";
  const PROGRAMS = "PD-CC-MF-SC";
  const BLOCKED = "The store's site started refusing requests. Wait a while, reload the coupons page, and run again.";

  function session() {
    const user = window.AB?.userInfo;
    const svc = window.userInfoServiceRefAL?.service;
    const { clientId = "", clientSecret = "" } = window.SWY?.CONFIGSERVICE?.datapowerConfig || {};
    return {
      token: user?.SWY_SHOP_TOKEN || svc?._userSession?.SWY_SHOP_TOKEN || "",
      storeId: String(user?.j4u?.storeId || user?.branchId || svc?.userInfo?.j4u?.storeId || svc?.userInfo?.branchId || ""),
      clientId,
      clientSecret,
      correlationId: user?.UUID || crypto.randomUUID(),
      banner: location.hostname.split(".").slice(-2, -1)[0],
    };
  }

  function headers(s) {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      SWY_SSO_TOKEN: s.token,
      "X-swyConsumerDirectoryPro": s.token,
      "X-IBM-Client-Id": s.clientId,
      "X-IBM-Client-Secret": s.clientSecret,
      "X-SWY_API_KEY": "emjou",
      "X-SWY_BANNER": s.banner,
      "X-SWY_VERSION": "1.0",
      "x-swy-correlation-id": s.correlationId,
    };
  }

  const isBlocked = (status) => status === 403 || status === 429;

  // Keep in sync with stores.js.
  const BANNERS = {
    albertsons: "Albertsons", tomthumb: "Tom Thumb", safeway: "Safeway", vons: "Vons",
    randalls: "Randalls", jewelosco: "Jewel-Osco", acmemarkets: "Acme", shaws: "Shaw's",
    starmarket: "Star Market", pavilions: "Pavilions", andronicos: "Andronico's",
    carrsqc: "Carrs", haggen: "Haggen", kingsfoodmarkets: "Kings", balduccis: "Balducci's",
    shopunitedsupermarkets: "United Supermarkets", shopmarketstreet: "Market Street",
    shopamigos: "Amigos", shopalbertsonsmarket: "Albertsons Market",
  };
  const banner = location.hostname.split(".").slice(-2, -1)[0];

  window.__gbc.register({
    id: banner,
    name: BANNERS[banner] || banner,
    isCouponPage: () => /coupons-deals/.test(location.pathname),

    async run(ctx) {
      // The page fills in its globals a moment after load.
      let s = session();
      for (let i = 0; i < 10 && !(s.token && s.storeId); i++) { await ctx.sleep(1000); s = session(); }
      if (!s.token) throw ctx.fail("login", "Sign in to the store's website first, then run again.");
      if (!s.storeId) throw ctx.fail("error", "Couldn't tell which store you shop at. Pick a store on the site, then run again.");

      const listUrl = `${API}/ecomgallery?offerPgm=${PROGRAMS}&storeId=${encodeURIComponent(s.storeId)}&transformOfferbyUpc=y`;
      const r = await fetch(listUrl, { credentials: "include", headers: headers(s) });
      if (isBlocked(r.status)) throw ctx.fail("blocked", BLOCKED);
      if (r.status === 401) throw ctx.fail("login", "Your sign-in expired. Sign in again, then run again.");
      if (!r.ok) throw ctx.fail("error", `The coupon list failed (HTTP ${r.status}).`);
      const json = await r.json();
      const raw = json?.offers;
      // The gallery holds clippable coupons only; points-redemption ("Activate")
      // rewards come from a different feed, so nothing here spends points.
      const all = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter((o) => o?.offerId && !o.deleted);

      const todo = all.filter((o) => o.status !== "C");
      ctx.found(all.length, all.length - todo.length);

      for (const o of todo) {
        await ctx.clip(async () => {
          const pgm = o.offerPgm || "SC";
          const res = await fetch(`${API}/offers/clip?storeId=${encodeURIComponent(s.storeId)}`, {
            method: "POST",
            credentials: "include",
            headers: headers(s),
            body: JSON.stringify({
              items: [
                { clipType: "C", itemId: String(o.offerId), itemType: pgm },
                { clipType: "L", itemId: String(o.offerId), itemType: pgm },
              ],
            }),
          });
          if (isBlocked(res.status)) throw ctx.fail("blocked", BLOCKED);
          if (res.status === 401) throw ctx.fail("login", "Your sign-in expired. Sign in again, then run again.");
          if (!res.ok) { console.log("[CouponSweep] clip failed", o.offerId, res.status); return false; }
          const body = await res.json().catch(() => ({}));
          return body?.items?.[0]?.status === 1;
        }, [450, 950], ctx.dollarsOff(o));
      }
    },
  });
})();

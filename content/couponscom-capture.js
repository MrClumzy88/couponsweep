// coupons.com, page world, document_start: keeps a copy of the printable
// coupon list the page itself loads (POST /api/getCoupons {guid, pageType}).
// Each coupon lists the exact product barcodes it covers (offer_items), which
// lets CouponSweep match it to receipt lines by UPC instead of by name.
// content/couponscom.js (isolated world) saves the list.

(() => {
  if (window.__gbcCC) return;
  window.__gbcCC = true;
  const fetch_ = window.fetch;
  window.fetch = async function (input, init) {
    const res = await fetch_.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input?.url;
      if (/\/api\/getCoupons$/.test(new URL(url, location.href).pathname)) {
        res.clone().json().then((j) => {
          const offers = (j?.offers || []).map((x) => x.offer || x).map((o) => ({
            id: String(o.coupon_id),
            cents: Number(o.value) || 0,
            brand: String(o.brand || "").trim(),
            name: String(o.short_description || o.brand || "").trim(),
            summary: `${o.offer_summary_top || ""} ${o.offer_summary_detail || ""}`.trim(),
            expiration: o.expiration_date,
            required: o.reward_category?.required_quantity || 1,
            upcs: (o.offer_items || []).map((i) => String(i.item_upc || "")).filter(Boolean),
          }));
          window.dispatchEvent(new CustomEvent("gbc:cc-offers", { detail: JSON.stringify(offers) }));
        }).catch(() => {});
      }
    } catch {}
    return res;
  };
})();

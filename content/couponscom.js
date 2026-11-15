// coupons.com, isolated world.
//  1. Saves the printable coupon list the page loaded (couponscom-capture.js)
//     as couponsCom in extension storage, for Find my rebates.
//  2. When the popup asks (ccPrefill = { ids, at }), clips those coupons on the
//     printable page by pressing each one's own "add" button, then shows a
//     note. The user presses Print: CouponSweep never prints anything.
// A coupon's id is in its image link (…/046/23443046.gif).

window.addEventListener("gbc:cc-offers", (e) => {
  let offers;
  try { offers = JSON.parse(e.detail); } catch { return; }
  if (offers?.length) chrome.storage.local.set({ couponsCom: { at: Date.now(), offers } });
});

(async () => {
  const { ccPrefill: p } = await chrome.storage.local.get("ccPrefill");
  if (!p?.ids?.length || Date.now() - p.at > 30 * 60 * 1000 || !/^\/printable/.test(location.pathname)) return;
  const wrappers = () => [...document.querySelectorAll('[data-testid="printable-coupon-wrapper"]')];
  for (let t = 0; t < 50 && !wrappers().length; t++) await new Promise((r) => setTimeout(r, 300));
  const idOf = (w) => w.querySelector('[data-testid="printable-coupon-image"]')?.getAttribute("srcset")?.match(/\/(\d{6,})\.gif/)?.[1];

  const clipped = [];
  for (const w of wrappers()) {
    if (!p.ids.includes(idOf(w))) continue;
    const add = w.querySelector('[data-testid="AddIcon"]')?.closest("button");
    if (add) { add.click(); await new Promise((r) => setTimeout(r, 400)); }
    clipped.push(w.querySelector('[data-testid="printable-coupon-name"]')?.textContent.trim() || idOf(w));
  }
  await chrome.storage.local.remove("ccPrefill");

  const note = document.createElement("div");
  note.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;background:#1d2430;color:#eef2f6;" +
    "border-radius:12px;padding:14px 16px;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)";
  note.innerHTML = "<div style='font-weight:600;margin-bottom:6px'>CouponSweep</div>";
  const body = document.createElement("div");
  body.textContent = clipped.length
    ? `Clipped ${clipped.length} coupon${clipped.length === 1 ? "" : "s"} for things you buy: ${clipped.join("; ")}. Press Print at the top to print them.`
    : "Those coupons aren't on the page any more (each prints a limited number of times).";
  const close = Object.assign(document.createElement("button"), { textContent: "Close" });
  close.style.cssText = "margin-top:10px;background:#475569;color:#fff;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit";
  close.onclick = () => note.remove();
  note.append(body, close);
  document.body.append(note);
})();

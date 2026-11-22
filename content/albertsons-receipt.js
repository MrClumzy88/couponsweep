// Albertsons-family receipt page helper (isolated world), for saving the
// store's own digital receipt as an image.
//
// /order-account/orders/instore/<transactionId>/receipt-details is the whole
// receipt: store, date, every item and price, payment, totals, and the same
// barcode that's printed on the paper receipt (store, lane, transaction,
// date, time). background.js scrolls through it with these messages and
// stitches screenshots (chrome.tabs.captureVisibleTab) into one PNG.

(() => {
  if (window.__gbcReceipt) return;
  window.__gbcReceipt = true;
  let hidden = [];

  const barcode = () => [...document.querySelectorAll("svg text")]
    .find((t) => /^\d{20,}$/.test(t.textContent.trim()))?.closest("svg");

  // The block from "Receipt details" (or "Order Date") down to the barcode.
  function container() {
    const svg = barcode();
    if (!svg) return null;
    const start = [...document.querySelectorAll("p, h1, h2, h3, div, span")]
      .find((e) => !e.children.length && /^(receipt details|order date)/i.test(e.textContent.trim()));
    let a = start;
    while (a && !a.contains(svg)) a = a.parentElement;
    return a || null;
  }

  // Sticky headers and the cookie banner would cover the receipt in every
  // screenshot, so they're hidden while capturing and put back afterwards.
  function hideFixed() {
    hidden = [...document.querySelectorAll("body *")].filter((e) => {
      const s = getComputedStyle(e);
      return (s.position === "fixed" || s.position === "sticky") && e.offsetHeight > 0;
    });
    hidden.forEach((e) => { e.dataset.gbcVis = e.style.visibility; e.style.visibility = "hidden"; });
  }
  function restore() {
    hidden.forEach((e) => { e.style.visibility = e.dataset.gbcVis || ""; delete e.dataset.gbcVis; });
    hidden = [];
  }
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))));

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg?.type === "receipt-geometry") {
      const c = container();
      if (!c) { send({ error: "No receipt on this page yet. Open a receipt and press Receipt." }); return; }
      hideFixed();
      const r = c.getBoundingClientRect();
      const digits = barcode()?.textContent.replace(/\D/g, "") || "";
      send({
        top: r.top + scrollY, left: r.left + scrollX, width: r.width, height: r.height,
        vh: innerHeight, dpr: devicePixelRatio, barcode: digits,
        date: (c.innerText.match(/Order Date:\s*([^\n]+)/i)?.[1] || "").trim(),
      });
      return;
    }
    if (msg?.type === "receipt-scroll") {
      scrollTo(0, msg.y);
      frames().then(() => send({ y: scrollY }));
      return true;
    }
    if (msg?.type === "receipt-restore") {
      restore();
      send({ ok: true });
    }
  });
})();

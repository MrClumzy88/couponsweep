// Builds the help website in docs/ (served by GitHub Pages from the docs
// folder): one page per supported store ("How to clip all Kroger digital
// coupons at once"), an index, a sitemap and robots.txt. People search for
// their own store, so each store gets a page of its own.
//
// Run `node scripts/build-pages.mjs` after changing stores.js. The check
// script fails when the committed pages don't match what this would build.

import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { STORES } from "../stores.js";

export const SITE = "https://mrclumzy88.github.io/couponsweep/";
const REPO = "https://github.com/MrClumzy88/couponsweep";
const INSTALL = `${REPO}#install`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// What's particular to each adapter (store family).
const FAMILIES = {
  kroger: {
    family: "Kroger",
    kind: "digital coupons",
    how: "It reads Kroger's own coupon list and sends the same clip request the site's <em>Clip</em> button sends.",
    limit: "Kroger cards hold about 250 coupons. CouponSweep clips the most valuable ones first, so a full card has the best coupons on it.",
    faq: [["Does it work for every Kroger store?", "Yes. Every Kroger banner shares one coupon system and CouponSweep supports all of them."]],
  },
  albertsons: {
    family: "Albertsons",
    kind: "“for U” digital coupons",
    how: "It reads the store's “for U” coupon gallery and sends the same clip request the site's <em>Clip Coupon</em> button sends.",
    limit: "It only clips coupons. It never redeems points or rewards.",
    faq: [["Is this the same as Just for U?", "Yes. “for U” (formerly Just for U) coupons are what it clips, on every store that uses that system."]],
  },
  heb: {
    kind: "digital coupons",
    how: "It reads H-E-B's coupon list and sends the same clip request the site's <em>Clip</em> button sends, including group (meal deal) coupons.",
  },
  target: {
    kind: "Target Circle offers",
    how: "It saves every Target Circle offer that needs saving (“Coupons to apply”). Other Circle deals apply on their own.",
    limit: "Target sometimes asks for a quick human check. CouponSweep stops and tells you; complete it yourself and run again.",
  },
  cvs: {
    kind: "ExtraCare coupons",
    how: "It presses the page's own <em>Send to card</em> buttons, so CVS's own code sends every request.",
    limit: "Sending ExtraBucks rewards to your card only makes them usable at checkout; nothing is spent.",
  },
  walgreens: {
    kind: "digital coupons",
    how: "It presses the page's own <em>Clip</em> buttons, so Walgreens' own code sends every request.",
    limit: "Walgreens accounts hold up to 200 clipped coupons, so the biggest dollar amounts are clipped first.",
  },
  bjs: {
    kind: "club coupons",
    how: "It presses the <em>CLIP</em> buttons on My Coupons, so BJ's own code sends every request, biggest dollar amounts first.",
  },
  walmart: {
    kind: "Walmart Cash offers",
    how: "It presses the page's own offer buttons on the Walmart Cash offers page, then goes through product search one department at a time, because many offers only show there.",
    limit: "A full Walmart run is slow (up to half an hour) because it goes page by page like a person would.",
  },
  chase: {
    kind: "Chase Offers",
    how: "It presses the page's own offer tiles, slowly, for the card the page has open.",
    limit: "Because it's a bank account, Chase only runs when you start it, never in the daily run.",
  },
};

const STYLE = `
:root { --bg: #fff; --fg: #0f172a; --muted: #475569; --line: #e2e8f0; --accent: #15803d; --box: #f1f5f9; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --fg: #e5e7eb; --muted: #94a3b8; --line: #1e293b; --accent: #4ade80; --box: #1e293b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main, header, footer { max-width: 720px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 20px; }
header a { color: var(--fg); font-weight: 700; text-decoration: none; }
h1 { font-size: 1.9rem; line-height: 1.25; margin: 24px 0 8px; }
h2 { font-size: 1.25rem; margin: 32px 0 8px; }
a { color: var(--accent); }
.lede { color: var(--muted); font-size: 1.1rem; margin-top: 0; }
.cta { display: inline-block; margin: 8px 0; padding: 10px 18px; border-radius: 8px; background: var(--accent); color: var(--bg); font-weight: 700; text-decoration: none; }
.note { border-left: 4px solid var(--muted); background: var(--box); padding: 10px 14px; border-radius: 4px; }
img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; }
ol li, ul li { margin: 4px 0; }
.stores { columns: 2 220px; padding-left: 20px; }
footer { color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--line); margin-top: 40px; padding-top: 12px; padding-bottom: 32px; }
`;

function layout({ title, description, path, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="${path.includes("/") ? "../" : ""}icon-128.png">
<style>${STYLE}</style>
</head>
<body>
<header><a href="${path.includes("/") ? "../" : "./"}">CouponSweep</a></header>
<main>
${body}
</main>
<footer>
<p>CouponSweep is free, open-source software. It is unofficial and not affiliated with or endorsed by any store or bank named here; their names belong to their owners. Automated clipping may go against a store's terms of use, and a store could limit an account it thinks is automated. Use it only on your own account, at your own risk.</p>
<p><a href="${REPO}">Source code</a> · <a href="${REPO}/blob/main/PRIVACY.md">Privacy policy</a> · <a href="${REPO}/issues">Report a problem</a></p>
</footer>
</body>
</html>
`;
}

const runnable = STORES.filter((s) => !s.comingSoon);

function storePage(s) {
  const f = FAMILIES[s.adapter] || { kind: "digital coupons", how: "" };
  const siblings = runnable.filter((o) => o.adapter === s.adapter && o.id !== s.id);
  const title = `How to clip all ${s.name} ${f.kind} at once (free)`;
  const description = `Clip every ${s.name} ${f.kind.replace(/“|”/g, "")} in one click with CouponSweep, a free, open-source browser extension that never sees your password.`;
  const faq = [
    ["Is it free?", "Yes. CouponSweep is free and open source, with no account and no subscription."],
    ["Does it need my password?", `No. You sign in to ${s.host.replace(/^www\./, "")} yourself, the normal way. CouponSweep works inside that page and only talks to ${s.name}.`],
    ...(s.noDaily ? [] : [["Can it clip new coupons every day?", "Yes. Turn on <em>Run once a day automatically</em> in the extension and pick a time. Chrome needs to be open then, and you need to stay signed in."]]),
    ...(f.faq || []),
    ["Will it spend anything?", "No. Clipping only makes a coupon available at checkout."],
  ];
  const body = `
<h1>${esc(title)}</h1>
<p class="lede">Stop pressing <em>Clip</em> one coupon at a time. CouponSweep clips every available ${esc(s.name)} ${f.kind} for you, using the account you're already signed in with.</p>
<a class="cta" href="${INSTALL}">Get CouponSweep (free)</a>

<h2>Steps</h2>
<ol>
<li><a href="${INSTALL}">Install CouponSweep</a> in Chrome, Edge or Brave.</li>
<li>Sign in at <a href="${esc(s.url)}" rel="nofollow">${esc(s.host.replace(/^www\./, ""))}</a> the way you normally do.</li>
<li>Click the CouponSweep button in the toolbar, check <strong>${esc(s.name)}</strong>, and click <strong>Clip</strong>.</li>
<li>Leave the tab open until the panel in the corner says it's done.</li>
</ol>
${s.noDaily ? "" : `<p>To keep up with new coupons, turn on <strong>Run once a day automatically</strong> and pick a time. You'll get a short summary when it's done.</p>`}

<h2>How it works</h2>
<p>${f.how} It goes one coupon at a time with short pauses, and stops with a plain message if ${esc(s.name)} says you're signed out, asks for a human check, or starts refusing requests.</p>
${f.limit ? `<p class="note">${f.limit}</p>` : ""}

<img src="../screenshot.png" alt="The CouponSweep popup listing stores and their last results, next to a coupon page with the progress panel" width="1280" height="800" loading="lazy">

<h2>Questions</h2>
${faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join("\n")}
${siblings.length ? `
<h2>Other ${esc(f.family || s.name)} stores</h2>
<p>The same works on: ${siblings.map((o) => `<a href="${o.id}.html">${esc(o.name)}</a>`).join(", ")}.</p>` : ""}
<p><a href="../">All supported stores</a></p>
`;
  return layout({ title, description, path: `stores/${s.id}.html`, body });
}

function indexPage() {
  const groups = new Map();
  for (const s of runnable) {
    const key = FAMILIES[s.adapter]?.family || "Other stores";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const order = ["Other stores", "Kroger", "Albertsons"];
  const sorted = [...groups].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const body = `
<h1>Clip every digital coupon at every store you shop, for free</h1>
<p class="lede">CouponSweep is a free, open-source browser extension that clips all of your digital coupons in one click, using the store accounts you're already signed in to. It never sees your password and sends nothing anywhere except to the store itself.</p>
<a class="cta" href="${INSTALL}">Get CouponSweep (free)</a>
<img src="screenshot.png" alt="The CouponSweep popup listing stores and their last results, next to a coupon page with the progress panel" width="1280" height="800">

<h2>Supported stores (${runnable.length})</h2>
${sorted.map(([name, list]) => `<h3>${name === "Other stores" ? "Grocery, pharmacy, big-box and card offers" : `${esc(name)} stores`}</h3>
<ul class="stores">
${list.map((s) => `<li><a href="stores/${s.id}.html">${esc(s.name)}</a></li>`).join("\n")}
</ul>`).join("\n")}

<h2>Coming next</h2>
<p>${STORES.filter((s) => s.comingSoon).map((s) => esc(s.name)).join(", ")}. <a href="${REPO}/issues/new?template=store_request.yml">Ask for a store</a>.</p>
`;
  return layout({
    title: "CouponSweep: free auto coupon clipper for Kroger, Safeway, H-E-B, CVS and more",
    description: `Clip every digital coupon in one click at ${runnable.length} stores, including Kroger, Safeway, H-E-B, Target, Walmart, CVS and Walgreens. Free, open source, never sees your password.`,
    path: "",
    body,
  });
}

// Every file the site is made of: { "docs-relative path": contents }.
export function pages() {
  const out = { "index.html": indexPage() };
  for (const s of runnable) out[`stores/${s.id}.html`] = storePage(s);
  out["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", ...runnable.map((s) => `stores/${s.id}.html`)].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}
</urlset>
`;
  out["robots.txt"] = `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`;
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const docs = fileURLToPath(new URL("../docs/", import.meta.url));
  mkdirSync(join(docs, "stores"), { recursive: true });
  const all = pages();
  for (const [path, text] of Object.entries(all)) writeFileSync(join(docs, path), text);
  copyFileSync(fileURLToPath(new URL("../icons/icon-128.png", import.meta.url)), join(docs, "icon-128.png"));
  console.log(`Wrote ${Object.keys(all).length + 1} files to docs/.`);
}

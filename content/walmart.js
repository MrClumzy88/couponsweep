// Walmart Cash adapter.
//
// Walmart's offer API only accepts requests carrying tracing headers its own
// site code generates, so instead of calling the API this adapter drives the
// page's own "Get this offer" buttons and pager, and Walmart's code makes
// every request. Slower, and tied to the page's markup, but nothing is faked.
//
// Two passes:
//  1. The all-offers page: 50 offers per page. It lists only part of what's
//     on offer.
//  2. Product search filtered to "Walmart Cash eligible", where each product
//     card has its own "Get $X Walmart Cash" toggle for its offer. Search stops
//     returning results after page 10, so the pass walks it one department at
//     a time (the department links on the search page). The move from the
//     offers page to search uses the site's own router, so this script keeps
//     running.
//
// Walmart flips a card to claimed as soon as it's clicked and flips it back if
// the request fails, so a clip only counts once the label has stayed put.

(() => {
  // ── Pass 1: all-offers page ────────────────────────────────────────────
  const grid = () => document.querySelector('[data-testid="all-offer-tiles-container"]');
  const cards = () => [...(grid()?.children || [])];
  const button = (card) => card.querySelector('[data-testid^="qa-id-walmartReward-"] .pointer');
  const claimed = (card) => /Offer claimed/i.test(card.innerText);
  const claimable = (card) => !!button(card) && /Get this offer/i.test(card.innerText);
  const nextButton = () => [...document.querySelectorAll('[data-testid="aop-pagination-container"] button, [data-testid="aop-pagination-container"] a')]
    .find((b) => b.getAttribute("aria-label") === "Next Page");

  // ── Pass 2: search results ─────────────────────────────────────────────
  const SEARCH_URL = "/browse?facet=reward_eligible%3AWalmart+Cash+eligible";
  const SEARCH_PAGES = 10; // Walmart returns nothing past page 10.
  const tiles = () => [...document.querySelectorAll("main [data-item-id]")];
  const getLabel = (tile) => [...tile.querySelectorAll('label[id^="product-reward-toggle-clip-checkbox-label-"]')]
    .find((l) => /^Get \$[\d.]+ Walmart Cash/i.test(l.innerText.trim()));
  const tileClaimed = (tile) => /\$[\d.]+ claimed/i.test(tile.innerText);
  const searchNext = () => [...document.querySelectorAll("main a, main button")]
    .find((b) => /^next page$/i.test(b.getAttribute("aria-label") || ""));
  const firstId = () => tiles()[0]?.getAttribute("data-item-id");

  // Department links on a search page that keep the Walmart Cash filter.
  function departments() {
    const seen = new Map();
    for (const a of document.querySelectorAll('main a[href^="/browse?"]')) {
      const href = a.getAttribute("href");
      const q = new URLSearchParams(href.split("?")[1]);
      const cat = q.get("cat_id");
      if (!cat || seen.has(cat) || !/reward_eligible:Walmart Cash eligible/i.test(q.get("facet") || "")) continue;
      const name = a.innerText.trim();
      if (name) seen.set(cat, { name, href });
    }
    return [...seen.values()];
  }

  async function waitFor(ctx, test, ms) {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await ctx.sleep(300);
    }
    return test();
  }

  // Moves to a search URL with the site's router; a full page load would end
  // this script. Resolves once the results have changed.
  async function goSearch(ctx, href) {
    const router = window.next?.router;
    if (!router?.push) throw ctx.fail("error", "Walmart's page changed; the search pass can't move between pages. The offers page pass still ran.");
    const before = location.pathname + location.search;
    const first = firstId();
    await router.push(href);
    await waitFor(ctx, () => location.pathname + location.search !== before, 10000);
    // Results swap in after the route changes; empty pages never get tiles.
    await waitFor(ctx, () => tiles().length > 0 && firstId() !== first, 10000);
    await ctx.sleep(ctx.between(800, 1500));
  }

  window.__gbc.register({
    id: "walmart",
    name: "Walmart Cash",
    isCouponPage: () => location.pathname.startsWith("/offer/all-offers"),

    async run(ctx) {
      if (/\/redirect\/identity|\/account\/login/.test(location.pathname)) {
        throw ctx.fail("login", "Sign in to walmart.com first, then run again.");
      }
      if (!location.pathname.startsWith("/offer/all-offers")) {
        throw ctx.fail("error", "Open walmart.com/offer/all-offers, then run again.");
      }
      if (!(await waitFor(ctx, () => cards().length > 0, 10000))) {
        throw ctx.fail("error", "Walmart's offers didn't load. Reload the page and run again.");
      }

      let total = 0;
      let already = 0;
      let failStreak = 0;
      const tally = (ok) => {
        failStreak = ok ? 0 : failStreak + 1;
        if (failStreak >= 5) throw ctx.fail("blocked", "Walmart stopped accepting offers. Wait a while, reload the page, and run again.");
      };

      // Pass 1
      for (let page = 1; page <= 30; page++) {
        const onPage = cards();
        total += onPage.length;
        already += onPage.filter(claimed).length;
        ctx.found(total, already);

        for (const card of onPage.filter(claimable)) {
          tally(await ctx.clip(async () => {
            card.scrollIntoView({ block: "center" });
            button(card).click();
            if (!(await waitFor(ctx, () => claimed(card), 5000))) return false;
            await ctx.sleep(1200);
            return claimed(card);
          }, [700, 1400]));
        }

        const next = nextButton();
        if (!next || next.disabled || next.getAttribute("aria-disabled") === "true") break;
        const first = onPage[0]?.innerText;
        next.click();
        ctx.status(`Loading page ${page + 1}…`);
        if (!(await waitFor(ctx, () => cards().length > 0 && cards()[0].innerText !== first, 10000))) break;
        await ctx.sleep(ctx.between(800, 1500));
      }

      // Pass 2
      ctx.status("Searching products with Walmart Cash offers…");
      await goSearch(ctx, SEARCH_URL);
      const depts = departments();
      if (!depts.length) depts.push({ name: "All", href: SEARCH_URL });
      const seenItems = new Set();

      for (const [i, dept] of depts.entries()) {
        ctx.checkStop();
        ctx.status(`Search: ${dept.name} (${i + 1} of ${depts.length})…`);
        await goSearch(ctx, dept.href);

        for (let page = 1; page <= SEARCH_PAGES && tiles().length; page++) {
          ctx.checkStop();
          // Departments overlap; count each product once.
          const fresh = tiles().filter((t) => !seenItems.has(t.getAttribute("data-item-id")));
          fresh.forEach((t) => seenItems.add(t.getAttribute("data-item-id")));
          const offers = fresh.filter((t) => getLabel(t) || tileClaimed(t));
          total += offers.length;
          already += offers.filter((t) => !getLabel(t)).length;
          ctx.found(total, already);

          for (const tile of offers) {
            // One offer often covers several products; once it's claimed on
            // one card the others may already show it.
            if (!getLabel(tile)) continue;
            tally(await ctx.clip(async () => {
              if (!getLabel(tile)) return tileClaimed(tile);
              tile.scrollIntoView({ block: "center" });
              getLabel(tile).click();
              if (!(await waitFor(ctx, () => tileClaimed(tile), 5000))) return false;
              await ctx.sleep(1200);
              return tileClaimed(tile);
            }, [700, 1400]));
          }

          const next = searchNext();
          if (page === SEARCH_PAGES || !next || next.disabled || next.getAttribute("aria-disabled") === "true") break;
          const first = firstId();
          ctx.status(`Search: ${dept.name}, page ${page + 1}…`);
          next.click();
          if (!(await waitFor(ctx, () => tiles().length > 0 && firstId() !== first, 10000))) break;
          await ctx.sleep(ctx.between(800, 1500));
        }
      }
    },
  });
})();

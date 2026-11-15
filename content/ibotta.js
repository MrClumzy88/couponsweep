// Ibotta adapter (opt-in, behind its own warning in the popup).
//
// Ibotta's Terms of Use ban "programmatic means", and a closed account loses
// its cash back, so this only runs after the user accepts the Ibotta warning
// (mirrored onto the page as data-gbc-ibotta-risk by content/bridge.js).
//
// A store's offers are at ibotta.com/retailers/<name>/<id> (signed in). Each
// card is .item-offer-card; its button has aria-label "Add offer to list",
// which becomes "Offer added to list" once Ibotta's own code has sent
// PUT api.ibotta.com/v2/customers/<you>/offers/<offerId>.json. Locked offers
// have no button and are skipped. The unfiltered page shows about 100 offers,
// so the adapter also ticks each category filter (its own checkboxes, one at a
// time) to reach the rest. The background runs one store page at a time.

(() => {
  const ADD = 'button[aria-label="Add offer to list"]';
  const addButtons = () => [...document.querySelectorAll(ADD)];
  const added = (b) => !b.isConnected || b.getAttribute("aria-label") !== "Add offer to list";
  const card = (b) => b.closest(".item-offer-card");
  const offerId = (c) => c?.querySelector('a[href*="/offers/"]')?.getAttribute("href").match(/\/(\d+)(?:\?|$)/)?.[1];
  const cashBack = (c) => Number((c?.innerText || "").match(/\$(\d{1,3}(?:\.\d\d)?)\s*back/i)?.[1]) || 0;

  const signedOut = () =>
    location.hostname.startsWith("authenticate.") ||
    /really you|log in to ibotta|enter the 6-digit code/i.test(document.body.innerText.slice(0, 2000));

  async function waitFor(ctx, test, ms) {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await ctx.sleep(300);
    }
    return test();
  }

  // The category filters: checkboxes with a label ("Dairy & Eggs", "Pantry"…).
  const categoryBoxes = () => [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((i) => i.labels?.[0] && i.labels[0].innerText.trim());

  async function toggle(ctx, box) {
    const before = document.querySelectorAll(".item-offer-card").length;
    (box.labels[0] || box).click();
    // The list re-renders; give it a moment either way.
    await waitFor(ctx, () => document.querySelectorAll(".item-offer-card").length !== before, 4000);
    await ctx.sleep(ctx.between(800, 1500));
  }

  window.__gbc.register({
    id: "ibotta",
    name: "Ibotta",
    risky: true,
    note: "⚠ USE AT YOUR OWN RISK. Ibotta's terms ban tools like this. Ibotta can close your account and keep your cash back.",
    isCouponPage: () => /^\/retailers\/[^/]+\/\d+/.test(location.pathname),

    async run(ctx) {
      if (signedOut()) throw ctx.fail("login", "Sign in to Ibotta (and finish any check it asks for), then run again.");
      if (!(await waitFor(ctx, () => document.querySelector(".item-offer-card"), 15000))) {
        if (signedOut()) throw ctx.fail("login", "Sign in to Ibotta (and finish any check it asks for), then run again.");
        throw ctx.fail("error", "No Ibotta offers showed up on this store's page.");
      }

      const seen = new Set();
      const already = new Set();
      const clippedIds = new Set(); // Added by this run (so not "already").
      let failStreak = 0;
      const count = () => {
        for (const c of document.querySelectorAll(".item-offer-card")) {
          const id = offerId(c);
          if (!id) continue;
          seen.add(id);
          const b = c.querySelector("button[aria-label]");
          if (b && added(b) && !clippedIds.has(id)) already.add(id);
        }
        ctx.found(seen.size, already.size);
      };

      async function addVisible() {
        count();
        const todo = addButtons()
          .filter((b) => !clippedIds.has(offerId(card(b))))
          .sort((a, b) => cashBack(card(b)) - cashBack(card(a)));
        for (const b of todo) {
          if (signedOut()) throw ctx.fail("login", "Ibotta asked you to sign in again. Do that, then run again.");
          const c = card(b);
          const id = offerId(c);
          const value = cashBack(c); // Read before the card changes.
          const ok = await ctx.clip(async () => {
            if (!b.isConnected) return false;
            b.scrollIntoView({ block: "center" });
            b.click();
            return waitFor(ctx, () => added(b), 8000);
          }, [1500, 3500], value);
          if (ok && id) clippedIds.add(id);
          failStreak = ok ? 0 : failStreak + 1;
          if (failStreak >= 3) throw ctx.fail("blocked", "Ibotta stopped adding offers. Leave it for today and check your Ibotta account.");
        }
      }

      // The unfiltered page first, then each category on its own.
      await addVisible();
      const names = categoryBoxes().map((i) => i.labels[0].innerText.trim());
      for (const name of names) {
        ctx.checkStop();
        const box = categoryBoxes().find((i) => i.labels[0].innerText.trim() === name);
        if (!box) continue;
        ctx.status(`Looking at ${name}…`);
        if (!box.checked) await toggle(ctx, box);
        await addVisible();
        const again = categoryBoxes().find((i) => i.labels[0].innerText.trim() === name);
        if (again?.checked) await toggle(ctx, again);
      }
      count();
    },
  });
})();

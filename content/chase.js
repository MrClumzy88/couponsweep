// Chase Offers adapter.
//
// This is a bank account, so the adapter only presses the page's own offer
// tiles and Chase's code sends every request. Pressing a tile adds the offer
// and moves to its details page, which has "Add offer" tiles of its own, so
// each add goes back to the full list before looking for the next tile.
// Anything other than the list coming back (sign-in, a security check) stops
// the run. Offers go on the card the page has open.

(() => {
  const isList = () => location.hash.startsWith("#/dashboard/merchantOffers/offerCategoriesPage")
    && /offerCategoryName=ALL/.test(location.hash);
  const isActivated = () => location.hash.startsWith("#/dashboard/merchantOffers/offer-activated/");
  const signedOut = () => /logon/i.test(location.pathname + location.hash) || !!document.querySelector('input[type="password"]');

  const tiles = () => (isList() ? [...document.querySelectorAll('[data-testid="commerce-tile"]')] : []);
  const label = (t) => (t.getAttribute("aria-label") || "").trim();
  const addable = (t) => /Add offer$/i.test(label(t));
  // "12 of 138 Merchant 5% cash back Add offer", without its position.
  const offerKey = (t) => label(t).replace(/^\d+ of \d+ /, "");

  async function waitFor(ctx, test, ms) {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await ctx.sleep(300);
    }
    return test();
  }

  window.__gbc.register({
    id: "chaseoffers",
    name: "Chase Offers",
    isCouponPage: isList,

    async run(ctx) {
      const signIn = "Sign in to chase.com first, then run again.";
      await waitFor(ctx, () => signedOut() || tiles().length > 0, 30000);
      if (signedOut()) throw ctx.fail("login", signIn);
      if (!tiles().length) throw ctx.fail("login", `No offers showed up. ${signIn}`);

      // The filters on the left ("Added to card", "Online"…) hide tiles and
      // reset on every return to the list, so start from the unfiltered list.
      document.querySelectorAll('input[type="checkbox"]:checked').forEach((box) => box.click());
      await ctx.sleep(1500);
      const total = tiles().length;
      ctx.found(total, total - tiles().filter(addable).length);

      const tried = new Set();
      let failStreak = 0;
      for (;;) {
        const tile = tiles().find((t) => addable(t) && !tried.has(offerKey(t)));
        if (!tile) break;
        tried.add(offerKey(tile));

        const ok = await ctx.clip(async () => {
          const index = tiles().indexOf(tile);
          tile.scrollIntoView({ block: "center" });
          tile.click();
          await waitFor(ctx, () => !isList() || !addable(tile), 8000);
          if (isList()) return false;

          // Linger on the details page the way a person would, then return.
          const added = isActivated();
          await ctx.sleep(ctx.between(800, 1600));
          history.back();
          const back = await waitFor(ctx, () => signedOut() || tiles().length >= total, 15000);
          if (signedOut()) throw ctx.fail("login", signIn);
          if (!back) throw ctx.fail("blocked", "Chase showed something other than the offers list, so the run stopped. Check the Chase tab.");
          return added && !addable(tiles()[index]);
        }, [1500, 3000]);

        failStreak = ok ? 0 : failStreak + 1;
        if (failStreak >= 5) throw ctx.fail("error", "Chase stopped accepting offers, so the run stopped. Check the Chase tab.");
      }
    },
  });
})();

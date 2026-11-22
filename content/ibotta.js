// Ibotta adapter (opt-in, behind its own warning in the popup).
//
// Ibotta's Terms of Use ban "programmatic means", and a closed account loses
// its cash back, so this only runs after the user accepts the Ibotta warning
// (mirrored onto the page as data-gbc-risk by content/bridge.js).
//
// It never adds every offer. The background runs it twice per store page
// (ibotta.com/retailers/<name>/<id>, signed in):
//   mode "scan": reads the store's offers, with their product lists, from the
//     page's own data ($nuxt.$store.state.offers, which holds all of them,
//     about 490 at Albertsons) and sends them back (gbc:offers) for
//     matcher.js to compare with your receipts. No clicks.
//   mode "add": presses + only on the offers in opts.ids (the exact matches).
//     The page only shows about 100 at a time, so it ticks each category
//     filter in turn (the page's own checkboxes) until it has found them all.
// Cards are .item-offer-card; the button's aria-label "Add offer to list"
// becomes "Offer added to list" once Ibotta's own code has sent its request.

(() => {
  const ADD = 'button[aria-label="Add offer to list"]';
  const added = (b) => !b.isConnected || b.getAttribute("aria-label") !== "Add offer to list";
  const card = (b) => b.closest(".item-offer-card");
  const offerId = (c) => c?.querySelector('a[href*="/offers/"]')?.getAttribute("href").match(/\/(\d+)(?:\?|$)/)?.[1];
  const retailerId = () => location.pathname.match(/^\/retailers\/[^/]+\/(\d+)/)?.[1];

  const signedOut = () =>
    location.hostname.startsWith("authenticate.") ||
    /really you|log in to ibotta|enter the 6-digit code/i.test(document.body.innerText.slice(0, 2000));

  // The category filters: checkboxes with a label ("Dairy & Eggs", "Pantry"…).
  const categoryBoxes = () => [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((i) => i.labels?.[0] && i.labels[0].innerText.trim());
  const boxNamed = (name) => categoryBoxes().find((i) => i.labels[0].innerText.trim() === name);

  async function toggle(ctx, box) {
    const before = document.querySelectorAll(".item-offer-card").length;
    (box.labels[0] || box).click();
    await ctx.waitFor(() => document.querySelectorAll(".item-offer-card").length !== before, 4000);
    await ctx.sleep(ctx.between(800, 1500));
  }

  // Calls `fn` on the unfiltered page and then once per category, unticking
  // each category again afterwards. `fn` returns true to stop early.
  async function eachView(ctx, fn) {
    if (await fn()) return;
    for (const name of categoryBoxes().map((i) => i.labels[0].innerText.trim())) {
      ctx.checkStop();
      const box = boxNamed(name);
      if (!box) continue;
      ctx.status(`Looking at ${name}…`);
      if (!box.checked) await toggle(ctx, box);
      const stop = await fn();
      const again = boxNamed(name);
      if (again?.checked) await toggle(ctx, again);
      if (stop) return;
    }
  }

  // The offers the page has loaded for this store, trimmed to what the
  // matcher needs.
  function storeOffers() {
    const all = window.$nuxt?.$store?.state?.offers;
    if (!all) return null;
    const rid = Number(retailerId());
    return Object.values(all)
      .filter((o) => !o.retailers || o.retailers.includes(rid))
      .map((o) => ({
        id: String(o.id),
        name: o.name,
        description: o.description,
        terms: o.terms,
        value: o.currentValue,
        amount: o.amount,
        anyItem: !!o.anyItem,
        anyBrand: !!o.anyBrand,
        activated: !!o.activated,
        expiration: o.expiration,
        redemptionMax: o.redemptionMax,
      }));
  }

  window.__gbc.register({
    id: "ibotta",
    name: "Ibotta",
    risky: true,
    note: "⚠ USE AT YOUR OWN RISK. Ibotta's terms ban tools like this. Ibotta can close your account and keep your cash back.",
    isCouponPage: () => /^\/retailers\/[^/]+\/\d+/.test(location.pathname),

    async run(ctx) {
      if (signedOut()) throw ctx.fail("login", "Sign in to Ibotta (and finish any check it asks for), then run again.");
      if (!(await ctx.waitFor(() => document.querySelector(".item-offer-card"), 15000))) {
        if (signedOut()) throw ctx.fail("login", "Sign in to Ibotta (and finish any check it asks for), then run again.");
        throw ctx.fail("error", "No Ibotta offers showed up on this store's page.");
      }
      const mode = ctx.opts?.mode || "scan";

      if (mode === "scan") {
        // The page loads every offer for the store into its data even though
        // it only shows about 100, so just wait for the count to settle.
        let last = -1;
        for (let stable = 0, i = 0; stable < 4 && i < 60; i++) {
          ctx.checkStop();
          await ctx.sleep(500);
          const n = storeOffers()?.length ?? 0;
          stable = n === last && n > 0 ? stable + 1 : 0;
          last = n;
          ctx.status(`Reading offers… ${n}`);
        }
        const offers = storeOffers();
        if (!offers) throw ctx.fail("error", "Couldn't read Ibotta's offer list. The page may have changed.");
        ctx.emit("gbc:offers", { retailerId: retailerId(), offers });
        ctx.found(offers.length, offers.length);
        ctx.summary = `Read ${offers.length} Ibotta offers.`;
        return;
      }

      // mode "add": only the offers the matcher picked.
      const want = new Set((ctx.opts.ids || []).map(String));
      const done = new Set();
      ctx.found(want.size, 0);
      let failStreak = 0;
      await eachView(ctx, async () => {
        for (const b of [...document.querySelectorAll(ADD)]) {
          const id = offerId(card(b));
          if (!want.has(id) || done.has(id)) continue;
          if (signedOut()) throw ctx.fail("login", "Ibotta asked you to sign in again. Do that, then run again.");
          const ok = await ctx.clip(async () => {
            if (!b.isConnected) return false;
            b.scrollIntoView({ block: "center" });
            b.click();
            return ctx.waitFor(() => added(b), 8000);
          }, [1500, 3500]);
          done.add(id);
          failStreak = ok ? 0 : failStreak + 1;
          if (failStreak >= 3) throw ctx.fail("blocked", "Ibotta stopped adding offers. Leave it for today and check your Ibotta account.");
        }
        // Offers already on the list have no + button; count them as done.
        for (const c of document.querySelectorAll(".item-offer-card")) {
          const id = offerId(c);
          if (want.has(id) && c.querySelector('button[aria-label="Offer added to list"]')) done.add(id);
        }
        return want.size > 0 && [...want].every((id) => done.has(id));
      });
      ctx.summary = `Added ${[...want].filter((id) => done.has(id)).length} of ${want.size} matched Ibotta offers.`;
    },
  });
})();

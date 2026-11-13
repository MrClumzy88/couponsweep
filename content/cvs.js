// CVS ExtraCare adapter.
//
// CVS's "send to card" request carries an encrypted account key, a device
// token and tracing IDs that only its own page code produces, so this adapter
// presses the page's own "Send to card" buttons and CVS's code sends every
// request. The ExtraCare page loads ten more coupons each time it's scrolled
// to the bottom, so everything is loaded first. Sending an ExtraBucks reward
// to the card only makes it usable at checkout; nothing is spent.

(() => {
  const coupons = () => [...document.querySelectorAll(".coupon-container-new-ui")];
  const sendButton = (c) => [...c.querySelectorAll("button.sc-send-to-card-action")].find((b) => /send to card/i.test(b.innerText || ""));
  const onCard = (c) => /\bOn card\b/i.test(c.innerText);

  async function waitFor(ctx, test, ms) {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await ctx.sleep(300);
    }
    return test();
  }

  window.__gbc.register({
    id: "cvs",
    name: "CVS ExtraCare",
    isCouponPage: () => location.pathname.startsWith("/extracare"),

    async run(ctx) {
      if (/account-login/.test(location.pathname)) throw ctx.fail("login", "Sign in to cvs.com first, then run again.");
      if (!(await waitFor(ctx, () => coupons().length > 0, 10000))) {
        throw ctx.fail("login", "No ExtraCare coupons showed up. Sign in to cvs.com, open the ExtraCare page, then run again.");
      }

      // Scroll until a few rounds in a row bring in nothing new.
      let last = -1;
      for (let stable = 0, i = 0; stable < 3 && i < 200; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await ctx.sleep(1200);
        const n = coupons().length;
        stable = n === last ? stable + 1 : 0;
        last = n;
        ctx.status(`Loading coupons… ${n} so far`);
      }
      window.scrollTo(0, 0);

      const all = coupons();
      const todo = all.filter((c) => !onCard(c) && sendButton(c));
      ctx.found(all.length, all.length - todo.length);

      // CVS sometimes refuses individual coupons and says so on the card
      // ("We're currently fixing an issue with this deal or reward"). Those
      // count as failed but don't mean CVS is refusing the whole run.
      const refusedByCvs = (c) => /fixing an issue|try again later/i.test(c.innerText);

      let failStreak = 0;
      for (const c of todo) {
        const value = ctx.dollarsOff(c.innerText); // Read before the card changes.
        const ok = await ctx.clip(async () => {
          const button = sendButton(c);
          if (!button) return onCard(c);
          button.scrollIntoView({ block: "center" });
          button.click();
          if (!(await waitFor(ctx, () => onCard(c) || refusedByCvs(c), 6000))) return false;
          await ctx.sleep(800);
          return onCard(c);
        }, [700, 1400], value);
        failStreak = ok || refusedByCvs(c) ? 0 : failStreak + 1;
        if (failStreak >= 5) throw ctx.fail("blocked", "CVS stopped accepting coupons. Wait a while, reload the page, and run again.");
      }
    },
  });
})();

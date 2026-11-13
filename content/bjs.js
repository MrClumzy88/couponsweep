// BJ's Wholesale Club adapter.
//
// The clip itself is one request (GET api.bjs.com/digital/live/api/v1.0/
// store/<club>/coupons/activate?offerId=…), but it carries the site's own
// auth, so this adapter presses the page's own "CLIP" buttons and BJ's code
// sends every request. /myCoupons loads 60 more coupons per scroll to the
// bottom; a clip counts once its CLIP button is gone or no longer says CLIP.

(() => {
  const clipButtons = () => [...document.querySelectorAll('button[data-testid="coupon-btn"]')]
    .filter((b) => /^(\+\s*)?CLIP( TO CARD)?$/i.test((b.innerText || "").trim()));
  const clipped = (b) => !b.isConnected || !/^(\+\s*)?CLIP( TO CARD)?$/i.test((b.innerText || "").trim());

  function couponText(b) {
    let el = b;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      if (/[$%]/.test(el.innerText || "")) return el.innerText;
    }
    return "";
  }
  const dollars = (b) => Math.max(0, ...[...couponText(b).matchAll(/\$(\d+(?:\.\d\d)?)/g)].map((m) => Number(m[1])));

  async function waitFor(ctx, test, ms) {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await ctx.sleep(300);
    }
    return test();
  }

  window.__gbc.register({
    id: "bjs",
    name: "BJ's",
    isCouponPage: () => location.pathname.toLowerCase().startsWith("/mycoupons"),

    async run(ctx) {
      if (/signin/i.test(location.pathname)) throw ctx.fail("login", "Sign in to bjs.com first, then run again.");
      if (!(await waitFor(ctx, () => document.querySelectorAll('button[data-testid="coupon-btn"]').length > 0 || /Clipped/i.test(document.body.innerText), 10000))) {
        throw ctx.fail("login", "No coupons showed up. Sign in to bjs.com, open My Coupons, then run again.");
      }

      // Scroll until a few rounds in a row bring in nothing new.
      let last = -1;
      for (let stable = 0, i = 0; stable < 3 && i < 100; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await ctx.sleep(1200);
        const n = clipButtons().length;
        stable = n === last ? stable + 1 : 0;
        last = n;
        ctx.status(`Loading coupons… ${n} to clip so far`);
      }
      window.scrollTo(0, 0);

      const todo = clipButtons().sort((a, b) => dollars(b) - dollars(a));
      ctx.found(todo.length, 0);

      let failStreak = 0;
      for (const b of todo) {
        const value = ctx.dollarsOff(couponText(b)); // Read before the button changes.
        const ok = await ctx.clip(async () => {
          if (!b.isConnected) return false;
          b.scrollIntoView({ block: "center" });
          b.click();
          return waitFor(ctx, () => clipped(b), 6000);
        }, [450, 900], value);
        failStreak = ok ? 0 : failStreak + 1;
        if (failStreak >= 5) throw ctx.fail("error", "BJ's stopped accepting clips. Your card may be full; check BJ's page for a message.");
      }
    },
  });
})();

// Walgreens adapter.
//
// Walgreens builds its clip address from per-account settings in the page, so
// this adapter presses the page's own "Clip" buttons and Walgreens' code sends
// every request; the button disappears once Walgreens confirms. The offers
// page loads about 50 more coupons each time it's scrolled to the bottom.
// Accounts hold at most 200 clipped coupons, so the biggest dollar amounts go
// first.

(() => {
  const clipButtons = () => [...document.querySelectorAll('button[id^="clip"]')]
    .filter((b) => /^Clip\b/i.test((b.getAttribute("aria-label") || b.innerText || "").trim()));
  const clipped = (b) => !b.isConnected || !/^Clip\b/i.test((b.getAttribute("aria-label") || b.innerText || "").trim());

  // The coupon's own text, from the nearest ancestor that mentions an amount.
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
    id: "walgreens",
    name: "Walgreens",
    isCouponPage: () => location.pathname.startsWith("/offers/"),

    async run(ctx) {
      if (/\/login|\/signin/i.test(location.pathname)) throw ctx.fail("login", "Sign in to walgreens.com first, then run again.");
      if (!(await waitFor(ctx, () => clipButtons().length > 0 || /clipped/i.test(document.body.innerText), 10000))) {
        throw ctx.fail("login", "No coupons showed up. Sign in to walgreens.com, open the coupons page, then run again.");
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
        const value = ctx.dollarsOff(couponText(b)); // Read before the button goes.
        const ok = await ctx.clip(async () => {
          if (!b.isConnected) return false;
          b.scrollIntoView({ block: "center" });
          b.click();
          return waitFor(ctx, () => clipped(b), 6000);
        }, [700, 1400], value);
        failStreak = ok ? 0 : failStreak + 1;
        if (failStreak >= 5) {
          throw ctx.fail("error", "Walgreens stopped accepting clips. Your account may be full (it holds up to 200 clipped coupons).");
        }
      }
    },
  });
})();

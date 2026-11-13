# Roadmap

Worked on weekly. The core (clipping at every supported store) stays free.

## Launch (Chrome Web Store)

- [ ] Developer account (separate Google account, 2-step verification, $5 fee).
- [ ] Merge, tag the release, upload `couponsweep-vX.Y.Z-webstore.zip` from the GitHub release.
- [ ] Paste the listing from [docs/store-listing.md](docs/store-listing.md); add screenshots (1280×800) and a 440×280 promo tile.
- [ ] Set up a donation page (GitHub Sponsors or Ko-fi), then set `DONATE_URL` in popup.js and uncomment `.github/FUNDING.yml`.
- [ ] After approval: point the README's Install section at the store listing; post in r/Frugal and r/kroger threads asking for this.

## Next features

- [x] **Savings total** in the popup ("$184 in coupons clipped this month"). Kroger's list has `savings`; Walgreens and BJ's adapters already read the "$" amount from card text; others need the value parsed from the offer.
- [x] **Run summary** after the daily run ("12 new coupons clipped at Kroger"), via a notification or the badge.
- [ ] **BJ's: recover from "Please refresh the page"** by reloading and continuing instead of stopping.
- [ ] **Firefox version**: background needs `background.scripts` alongside `service_worker`; publish on addons.mozilla.org.
- [ ] **A page per store** on GitHub Pages ("How to clip all Hannaford digital coupons"), which is how OttoClipper ranks in search.

## Stores in development

Shown greyed out in the popup (`comingSoon` in stores.js). Each needs a
signed-in account to watch the site's own clip request, an adapter, manifest
entries, then `comingSoon` removed. Check each `url` in stores.js; several are
guesses.

- [x] United Family stores on the Albertsons system: United Supermarkets, Market Street, Amigos, Albertsons Market (now `shop<name>.com`; same `window.AB`/`SWY`, `/loyalty/coupons-deals` and banner = domain). Added 2026-11-13; still to try with a signed-in account.
- [ ] Ahold Delhaize: Stop & Shop, Giant Food, GIANT, Martin's, Food Lion, Hannaford. Probably one shared backend, so one adapter. Checked 2026-11-13 (signed out): Stop & Shop's menu links to `/coupons`; Giant Food, GIANT, Martin's and Food Lion send `/coupons` to their home page when signed out (find the real path signed in); Food Lion lives at `foodlion.com` (no www); Hannaford showed a bot check, so it wasn't looked at.
- [ ] Harris Teeter (Kroger-owned, separate site).
- [ ] Publix, Meijer mPerks, ShopRite, Dollar General, Hy-Vee, Wegmans.
- [x] Chase Offers (the card the page has open; other cards still to do).
- [ ] Card offers: Amex, Citi, Bank of America, Capital One. Bank sites are strict about automation and hold far more sensitive accounts: drive the page's own buttons only, go slowly, and stop at any challenge.

## Possible paid extras (later, only if it takes off)

The basic clipping stays free. Ideas for an optional upgrade:

- New-coupon notifications.
- Categories and favourites: clip or highlight the coupons you care about first.
- Promo codes at checkout.
- Coupon stacking: for an item, show every discount that can combine (store
  digital coupon + manufacturer coupon + rebate apps like Ibotta + the current
  sale), and flag stacks worth making a trip for. Needs offer data from more
  than one source, and each store's stacking rules.
- "Your usual items are cheapest at X this week": the user keeps a list of
  what they usually buy (entered by hand, kept on their computer), and
  CouponSweep compares sale prices and clipped coupons across their stores.

## Competitors (as of 2026-11-01)

- OttoClipper: about 120 stores and card offers, Chrome, "free to start"; ranks with per-store pages.
- DigiClippy: phone app, 80+ stores, $2.99/month.
- Savewise: 28 Kroger/Albertsons chains, browser and iOS, free.
- Grocery Coupon Clipper (Neo Cortex): Chrome, 385 users, a few stores, stops at 100 per run.
- Single-store tools: smkent/safeway-coupons (Python, stores your password, GPL), BJ's Auto Coupon Clipper (Firefox, MPL).

Our angle: free, open source, never sees your password, highest-value
coupons first, grocery + pharmacy + big-box in one button.

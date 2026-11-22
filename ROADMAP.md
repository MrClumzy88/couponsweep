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
- [x] **Cash back too**: a popup section that walks the user through Ibotta,
  Checkout 51 and Fetch, with a button to each of their stores' Ibotta offer
  pages. The user presses the offers; Ibotta's terms ban tools doing it.
- [x] **Find my rebates** (free for now; a candidate for the paid tier): reads
  Albertsons-family receipts, finds the Ibotta offers whose product lists
  exactly match what you usually buy (added before you shop: pays through a
  linked store card) or bought in the last 7 days (popup says which receipt
  to scan in the Ibotta app, by when). Only exact matches are added; "maybe"
  matches are listed for the user to check. Next: receipts from Kroger and
  other stores, and Checkout 51 / Fetch.
- [x] **Checkout 51 and Fetch** in the same pipeline: Checkout 51's weekly
  offers (public JSON, read-only) matched to this week's receipts, with a
  button that opens the upload page with the matching offers ticked; Fetch
  gets a list of receipts still inside its 14-day window to scan.
- [x] **Receipt image for Checkout 51** (built; test in real Chrome): Albertsons' receipt-details page
  (`/order-account/orders/instore/<transactionId>/receipt-details`) is the
  full receipt, including the same barcode as the paper one (store, lane,
  transaction, date, time). Save it as one tall PNG and attach it on the
  upload page. Checkout 51 takes JPEG/PNG screenshots of e-receipts (not
  PDFs); whether it takes them for in-store trips needs a test. The popup's
  "This receipt" panel saves it, and "Fill in Checkout 51" attaches it.
- [ ] **Albertsons "Email receipt" → Fetch eReceipts** (popup opens the
  store's email page; the user presses Send): the receipt page can
  email the receipt to the account address. If Fetch reads Albertsons
  emails from a linked Gmail, receipts would reach Fetch with no scanning.
  Needs a test with one receipt.
- [x] **coupons.com** in Find my rebates: reads the printable list the page
  loads (`/api/getCoupons`; each coupon lists the barcodes it covers), matches
  your receipts by barcode, and clips the matches on its page for you to print.
- [x] **Rebates page** (`rebates.html`): to-do list by deadline with one
  button each, a before-you-shop table per item, and the apps with the
  Ibotta switch. The popup keeps clipping and shows a one-line summary.
- [x] **Clear run status** (0.8.6): the rebates page shows each step while
  Find my rebates runs, then Done with the matches named, or Didn't finish
  with what to do; Stop button; runs no longer die when Chrome idles the
  background worker.
- [x] **Stacks**: one list per product of every exact deal (coupons.com,
  Checkout 51, Ibotta). Next: add the store's own digital coupons (the
  Albertsons gallery) to the stack. Candidate for the paid tier.
- [ ] **BJ's: recover from "Please refresh the page"** by reloading and continuing instead of stopping.
- [ ] **Firefox version**: background needs `background.scripts` alongside `service_worker`; publish on addons.mozilla.org.
- [x] **A page per store** ("How to clip all Kroger digital coupons"), which is how OttoClipper ranks in search. Built by `scripts/build-pages.mjs` into `docs/`.
- [ ] **Sunday newspaper inserts**: paper manufacturer coupons can't be
  clipped, so show them instead: this week's inserts (SmartSource, Save,
  P&G brandSAVER), their best coupons, and which ones match a sale or a
  clipped store coupon. Find a source we're allowed to use (insert previews
  are other sites' work; don't scrape and republish them).
- [ ] **Turn on GitHub Pages**: repo Settings → Pages → Deploy from a branch → `main`, folder `/docs`. The site will be at https://mrclumzy88.github.io/couponsweep/. Then add the sitemap in Google Search Console. When the Web Store listing is live, point `INSTALL` in `scripts/build-pages.mjs` at it.

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
- Receipt check: the user adds a photo or the e-receipt from a trip, and an
  AI reads the items and lists the rebate offers (Ibotta, Checkout 51 and
  others) they can still claim for it, with the steps to claim each one.
- Coupon stacking: for an item, show every discount that can combine (store
  digital coupon + manufacturer coupon + rebate apps like Ibotta + the current
  sale), and flag stacks worth making a trip for. Needs offer data from more
  than one source, and each store's stacking rules.
- "Your usual items are cheapest at X this week": the user keeps a list of
  what they usually buy (entered by hand, kept on their computer), and
  CouponSweep compares sale prices and clipped coupons across their stores.
- Meal planning from the weekly ad: suggest the week's meals from what's on
  sale and what's been clipped at the user's stores, plus a shopping list.
  Needs each store's weekly ad data.
- Stock-up alerts: from the user's usual-items list, spot when an item hits
  its low price (sales repeat about every 6–8 weeks) and say how many to buy
  to last until the next sale. Needs price history kept on the user's computer.

## High-ROI Money-Saving Avenues (Antigravity Suggestions)

Ideas added during the 2026-11-15 review to maximize actual dollars saved within CouponSweep's local-only, no-password architecture:

- [ ] **4-way "true stacking" with store digital coupons & conflict warnings**:
  `albertsons.js`, `kroger.js`, `heb.js`, and `target.js` already download every store coupon (and Albertsons fetches `transformOfferbyUpc=y`). Save those store offers locally so `buildStacks` in `background.js` shows **Store Digital + Printable (`coupons.com`) + Ibotta + Checkout 51** on one row, flags "free / moneymaker" combos, and warns on non-stackable pairs (e.g., Walmart Cash and Ibotta share the same offer pool and do not stack).
- [ ] **Fuel-point multipliers & basket-threshold boosters ("Spend $X, Get $Y")**:
  On Kroger (`kroger.js`), cards cap around 250 coupons and sort by `Number(b.savings) || 0`. **2x/4x Fuel Points Friday** and **4x Gift Card Fuel Points** report `savings: 0` and drop to the bottom, getting skipped when the card is full despite saving $14–$35 per fill-up. Prioritize fuel-point and basket-threshold coupons ahead of low-value item offers, and add **Target Circle Bonuses** (e.g., *"Make 2 $75 trips, earn $15 Target Circle Rewards"*) which sit in a separate feed from item deals.
- [ ] **Expiring rewards & "use-it-or-lose-it" alerts**:
  While adapters already visit signed-in pages, capture reward balances and expiration dates for **CVS ExtraBucks**, **Albertsons "for U" expiring points**, **Walgreens Cash**, and soon-to-expire high-value clipped coupons, then surface countdown warnings in the popup (e.g., *"⚠ $5.00 CVS ExtraBucks expires in 2 days"*).
- [ ] **Personal price book, stock-up lows, shrinkflation & price-adjustment alerts**:
  Use the itemized UPC and net-price history already captured by `albertsons-purchases.js` (`reducedPriceTotal`) to build a local price book that flags:
  - **Historical low / stock-up price:** when a staple hits its 4-month net low after coupons and rebates.
  - **Quiet price hikes & shrinkflation:** when unit price or package size changes across recent receipts.
  - **Post-purchase price-adjustment windows:** reminders when recently bought items drop in price inside Target's 14-day or Costco's 30-day adjustment window.
- [ ] **Expand receipt sync to Kroger, Walmart, Target & H-E-B**:
  Currently `syncPurchases` only reads Albertsons-family `/order-account/orders`. Add receipt readers for Kroger (`/mypurchases`), Walmart (`/orders`, including card-linked in-store trips), Target, and H-E-B so non-Albertsons shoppers get full rebate matching, Stacks, and price-book tracking.
- [ ] **Multi-card Chase Offers loop & "best card for this store" reminders**:
  Have `chase.js` cycle through the card-selector dropdown under one login so the same 10%–15% grocery/pharmacy/dining offer is clipped across every household card, and surface a popup reminder showing which checked store currently has an active card offer to swipe at checkout.
- [ ] **Additional stackable rebate feeds & Ibotta bonus completion tracking**:
  - **Prodege Magic Receipts** (Swagbucks / MyPoints / InboxDollars) and **Merryfield** (natural/organic brands with direct Kroger/Albertsons/Target loyalty linking), which stack on the exact same receipt as Ibotta and Checkout 51.
  - **Aisle** (`discover.gotoaisle.com`) SMS/Venmo/PayPal offers (often BOGO or 100% free at Target, Walmart, H-E-B, and Albertsons).
  - **Ibotta bonus alerts**: highlight when a matched rebate brings you 1–2 offers away from completing an active Ibotta bonus (*"Weekend Warrior"* / *"Midweek Money Maker"*).

## Competitors (as of 2026-11-01)

- OttoClipper: about 120 stores and card offers, Chrome, "free to start"; ranks with per-store pages.
- DigiClippy: phone app, 80+ stores, $2.99/month.
- Savewise: 28 Kroger/Albertsons chains, browser and iOS, free.
- Grocery Coupon Clipper (Neo Cortex): Chrome, 385 users, a few stores, stops at 100 per run.
- Single-store tools: smkent/safeway-coupons (Python, stores your password, GPL), BJ's Auto Coupon Clipper (Firefox, MPL).

Our angle: free, open source, never sees your password, highest-value
coupons first, grocery + pharmacy + big-box in one button.

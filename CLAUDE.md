# CouponSweep — notes for contributors and coding agents

A Chrome MV3 extension that clips digital coupons from the user's own
signed-in browser. README.md covers install, layout and how to add a store.
This is a public project: keep it free of personal data and hard-coded per-user
values (store IDs, account numbers, tokens). Read everything per-user from the
page at run time.

## Ground rules

- Each store (or family of stores sharing a backend) is one adapter in
  `content/<id>.js`, registered with the shared runner (`content/runner.js`).
  Adapters list offers and clip them the way the site does, from the page's own
  JS world, one at a time with jittered pauses.
- When a site answers with a sign-in wall, CAPTCHA or rate limit, the adapter
  stops and tells the user. Don't add workarounds for bot protection: no forged
  or copied tracing headers, no CAPTCHA solving, no fingerprint spoofing.
- Endpoints change. When one breaks, find the current request by reading the
  site's loaded JS bundles or watching the site's own request, not by guessing.
- Chrome throttles timers in background tabs, so the runner's pauses are timed
  by the service worker (`gbc:sleep` → `content/bridge.js` → `background.js`).
- New stores go in `stores.js`, `manifest.json` (host_permissions and
  content_scripts) and the README's store table.

## Store notes (as of 2026-10-31)

- **H-E-B**: list = `/_next/data/<buildId>/en/digital-coupon/coupon-selection/all-coupons.json`
  (cursor pages; `clippedStatus` only when signed in). Clip = plain GraphQL
  `mutation CouponClip { clip(id) }` / `clipGroup(id)` on `/graphql`.
- **Target**: list = redsky `get_circle_noncircle_recommended_promotions_v1`,
  placement `deals_offer_grid_tap`, paged with `page_token`. Save = POST
  `api.target.com/loyalty_guest_offerlists/v1/external/<offerId>?location_id=<store>`.
  PerimeterX returns HTTP 435 + CAPTCHA on bursts.
- **Albertsons family** (`content/albertsons.js`, 15 banners): list = GET
  `/abs/pub/web/j4u/api/ecomgallery?offerPgm=PD-CC-MF-SC&storeId=…`
  (`status` "C"/"U"); clip = POST `/abs/pub/web/j4u/api/offers/clip`. Needs the
  page's shopper token, store id and IBM client id/secret (from `window.AB`,
  `window.SWY`). Coupons page is `/loyalty/coupons-deals`. Akamai blocks bursts.
  Points-redemption rewards aren't in the gallery feed.
- **Kroger family** (`content/kroger.js`, 18 banners): list = GET
  `/atlas/v1/savings-coupons/v2/coupons` (72/page by `page.offset`;
  `addedToCard`, `canBeAddedToCard`, `savings`); clip = POST
  `/atlas/v1/savings-coupons/v1/clip-unclip` `{action:"CLIP", couponId}`.
  Both return 400 `LAF_OBJECTS_REQUIRED` without the store-context headers
  (`x-laf-object`, `x-modality`, `X-Facility-Id`…) the site keeps in memory;
  `content/kroger-context.js` (document_start) records them from the site's own
  /atlas/ requests. Never copy `x-kroger-channel` (the site sets it several
  times; merged values are rejected). Cards hold about 250 coupons (422
  `TooManyCouponsOnCard`), so the adapter clips highest `savings` first.
- **CVS ExtraCare** (`content/cvs.js`): the send-to-card POST carries an
  encrypted account key (`ecKey`), hashed card number, device token and GRID
  tracing header from CVS's own code, so the adapter drives the page:
  `/extracare/home` loads 10 more coupons per scroll to the bottom; cards are
  `.coupon-container-new-ui`, button `button.sc-send-to-card-action` ("Send to
  card"); success = the card says "On card".
- **Walgreens** (`content/walgreens.js`): clip is a plain POST
  `{id, offerStartDate, offerEndDate, source, redemptionType}`, but its URL comes
  from per-account page config, so the adapter drives the page instead:
  `/offers/offers.jsp` loads ~50 more per scroll; buttons
  `button[id^="clip"]` with aria-label "Clip coupon"/"Clip rebate"; success =
  the button disappears. Accounts hold 200 clipped coupons
  (`/offers/v1/svc/coupons/clipped` → `summary.maxClippingLimit`), so the
  adapter clips the largest "$" amount in the card text first.
- **BJ's** (`content/bjs.js`): list = `api.bjs.com/digital/live/api/v1.0/member/available/offers`;
  clip = GET `…/v1.0/store/<club>/coupons/activate?offerId=…` with the site's
  auth, so the adapter drives the page: `/myCoupons` loads 60 more per scroll;
  buttons `button[data-testid="coupon-btn"]` reading "CLIP"; success = the
  button is gone or no longer says CLIP. The list POST body is
  `{pagesize, brand, category, indexForPagination, isPrev, isNext, searchString,
  membershipNumber, zipcode}`, but direct requests from extension code (even
  with cookies) get Akamai "Access Denied" 403, so a request-based adapter isn't
  viable; don't try to get past that. Pause is 450–900 ms per coupon.
  (fenerty/bjs-coupon-clipper is a separate, unlicensed userscript; don't copy
  from it.)
- **Walmart Cash**: the offer API (persisted `GetAllOffersPageQuery`,
  `clipRewardPromotionEngine`) answers HTTP 429 unless the site's own tracing
  headers are present, so the adapter drives the page instead: cards in
  `[data-testid="all-offer-tiles-container"]`, click
  `[data-testid^="qa-id-walmartReward-"] .pointer`; success = the card says
  "Offer claimed" and stays that way (the UI flips optimistically and reverts
  on failure); pager button `aria-label="Next Page"`, 50 offers per page.
- **Chase Offers** (`content/chase.js`): a bank account, so the adapter drives
  the page and stays out of the daily run (`noDaily`). The whole list is in the
  page at `#/dashboard/merchantOffers/offerCategoriesPage?offerCategoryName=ALL`
  (Chase adds the `accountId`; never hard-code one). Tiles are
  `a[data-testid="commerce-tile"]`; `aria-label` ends "Add offer" or "Success
  Added". Pressing one adds the offer and moves to
  `#/dashboard/merchantOffers/offer-activated/<offerId>`, whose "Explore more
  offers" tiles have the same markup and must never be pressed, so go back and
  wait for the full list first. Tiles keep their places after going back; added
  offers only sort to the bottom on a fresh load. The left-hand filters ("Not
  added" etc.) aren't in the URL and reset on going back, so they can't drive the
  loop; the adapter clears them at the start. All Chase screens share one
  path, which is why `runStore` also compares the #route when reusing a tab.

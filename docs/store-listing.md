# Chrome Web Store listing

Text for the store dashboard. The title and the short summary come from
`name` and `description` in manifest.json; everything else is pasted into the
dashboard by hand. Keep the store list in step with `stores.js`, and the
disclaimer in step with the README's Disclaimer section.

## Title (manifest `name`, max 75 characters)

CouponSweep – Auto Coupon Clipper for Kroger, H-E-B, CVS & More

Three store names at most; more than that reads as keyword stuffing to
reviewers.

## Category

Shopping

## Description

Clip every coupon at every store you shop, for free. Open source, and it
never sees your password.

Clip every digital coupon on your store account in one click. CouponSweep
loads all of your store's digital coupons to your card, so you never have to
press "Clip" or "Load to Card" hundreds of times again.

Free and open source. No account, no subscription, no password.

★ What it does
• Clips every available digital coupon, often hundreds per store, while you do something else.
• One button for all your stores: check the ones you shop at and click "Clip all checked stores".
• Optional daily run, so new coupons get clipped as they appear.
• Smart about card limits: where a store caps how many coupons a card can hold (Kroger, Walgreens), the biggest savings are clipped first.
• Gentle on the store: one coupon at a time with short pauses, and it stops with a plain message if the store asks you to sign in or complete a check.

★ How it works
1. Sign in to your store's website as you normally would.
2. Open CouponSweep and check the stores you shop at.
3. Click Clip. A small panel on the store's page shows progress.

★ Private by design
• Never sees, asks for or stores your password. It works in the session you're already signed in with.
• Sends nothing anywhere except clip requests to the store itself.
• No servers, no analytics, no tracking. Your settings stay on your computer.

★ Supported stores (about 40 store websites)
• Kroger family: Kroger, Ralphs, Fry's, King Soopers, Fred Meyer, Smith's, QFC, Dillons, City Market, Baker's, Gerbes, Jay C, Pay Less, Mariano's, Pick 'n Save, Metro Market, Foods Co, Food 4 Less
• Albertsons family: Albertsons, Safeway, Vons, Tom Thumb, Randalls, Jewel-Osco, Acme, Shaw's, Star Market, Pavilions, Andronico's, Carrs, Haggen, Kings, Balducci's
• H-E-B digital coupons
• Target Circle offers
• Walmart Cash offers
• CVS ExtraCare coupons (Send to card)
• Walgreens digital coupons
• BJ's Wholesale Club coupons
• Chase Offers (credit card offers)

In development: Publix, Meijer mPerks, ShopRite, Stop & Shop, Giant, Food
Lion, Hannaford, Dollar General, Hy-Vee, Harris Teeter, Wegmans, and card
offers (Amex, Citi, Bank of America, Capital One). New stores are added
regularly. Want another one? Request it on GitHub.

★ This clips store coupons, not promo codes
CouponSweep loads the digital coupons your store offers onto your loyalty
card or account, so they come off at checkout in store and online. It doesn't
search for promo codes.

Source code, FAQ and store requests: https://github.com/MrClumzy88/couponsweep

DISCLAIMER: CouponSweep is an unofficial tool. It isn't affiliated with or
endorsed by any of the stores named above; their names are used only to say
which sites it works with. Automatically clipping coupons may go against a
store's terms of use, and a store could limit, suspend or close an account it
believes is automated. Use it only for personal, low-volume use on your own
account, at your own risk.

## Privacy tab

**Single purpose:** Clips available digital coupons on supported grocery and
pharmacy store websites the user is already signed in to.

**Permission justifications:**
- *storage:* Remembers which stores the user checked, their order, the daily-run setting and each store's last result, on the user's computer only.
- *alarms:* Runs the optional once-a-day clip.
- *Host permissions:* Runs only on the supported stores' websites, to list that store's coupons and clip them in the user's own signed-in session. It does nothing on any other site.

**Remote code:** No.

**Data usage:** None collected. Privacy policy:
https://github.com/MrClumzy88/couponsweep/blob/main/PRIVACY.md

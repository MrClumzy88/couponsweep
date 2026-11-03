// Stores the extension knows about. `url` is the page the run happens on;
// `host` finds an already-open tab for that store. `adapter` names the file
// in content/ that handles it. `comingSoon` stores show in the popup but
// never run. `noDaily` stores only run when the user starts them.

const albertsonsFamily = [
  ["albertsons", "Albertsons", "albertsons.com"],
  ["tomthumb", "Tom Thumb", "tomthumb.com"],
  ["safeway", "Safeway", "safeway.com"],
  ["vons", "Vons", "vons.com"],
  ["randalls", "Randalls", "randalls.com"],
  ["jewelosco", "Jewel-Osco", "jewelosco.com"],
  ["acmemarkets", "Acme", "acmemarkets.com"],
  ["shaws", "Shaw's", "shaws.com"],
  ["starmarket", "Star Market", "starmarket.com"],
  ["pavilions", "Pavilions", "pavilions.com"],
  ["andronicos", "Andronico's", "andronicos.com"],
  ["carrsqc", "Carrs", "carrsqc.com"],
  ["haggen", "Haggen", "haggen.com"],
  ["kingsfoodmarkets", "Kings", "kingsfoodmarkets.com"],
  ["balduccis", "Balducci's", "balduccis.com"],
].map(([id, name, domain]) => ({
  id, name, adapter: "albertsons", host: `www.${domain}`, url: `https://www.${domain}/loyalty/coupons-deals`,
}));

const krogerFamily = [
  ["kroger", "Kroger", "kroger.com"],
  ["ralphs", "Ralphs", "ralphs.com"],
  ["frysfood", "Fry's", "frysfood.com"],
  ["kingsoopers", "King Soopers", "kingsoopers.com"],
  ["fredmeyer", "Fred Meyer", "fredmeyer.com"],
  ["smithsfoodanddrug", "Smith's", "smithsfoodanddrug.com"],
  ["qfc", "QFC", "qfc.com"],
  ["dillons", "Dillons", "dillons.com"],
  ["citymarket", "City Market", "citymarket.com"],
  ["bakersplus", "Baker's", "bakersplus.com"],
  ["gerbes", "Gerbes", "gerbes.com"],
  ["jaycfoods", "Jay C", "jaycfoods.com"],
  ["pay-less", "Pay Less", "pay-less.com"],
  ["marianos", "Mariano's", "marianos.com"],
  ["picknsave", "Pick 'n Save", "picknsave.com"],
  ["metromarket", "Metro Market", "metromarket.net"],
  ["foodsco", "Foods Co", "foodsco.net"],
  ["food4less", "Food 4 Less", "food4less.com"],
].map(([id, name, domain]) => ({
  id, name, adapter: "kroger", host: `www.${domain}`, url: `https://www.${domain}/savings/cl/coupons/`,
}));

// In development: shown in the popup (greyed out) so people can see what's
// next. Each needs an adapter, manifest entries and testing on a signed-in
// account before `comingSoon` comes off. See ROADMAP.md.
const inDevelopment = [
  ["publix", "Publix", "www.publix.com", "https://www.publix.com/savings/digital-coupons"],
  ["meijer", "Meijer mPerks", "www.meijer.com", "https://www.meijer.com/shopping/coupons.html"],
  ["shoprite", "ShopRite", "www.shoprite.com", "https://www.shoprite.com/digital-coupon"],
  ["stopandshop", "Stop & Shop", "stopandshop.com", "https://stopandshop.com/coupons"],
  ["giantfood", "Giant Food", "giantfood.com", "https://giantfood.com/coupons"],
  ["giantfoodstores", "GIANT", "giantfoodstores.com", "https://giantfoodstores.com/coupons"],
  ["martins", "Martin's", "martinsfoods.com", "https://martinsfoods.com/coupons"],
  ["foodlion", "Food Lion", "www.foodlion.com", "https://www.foodlion.com/coupons"],
  ["hannaford", "Hannaford", "www.hannaford.com", "https://www.hannaford.com/coupons"],
  ["dollargeneral", "Dollar General", "www.dollargeneral.com", "https://www.dollargeneral.com/deals/coupons"],
  ["hyvee", "Hy-Vee", "www.hy-vee.com", "https://www.hy-vee.com/deals/coupons"],
  ["harristeeter", "Harris Teeter", "www.harristeeter.com", "https://www.harristeeter.com/savings/cl/coupons/"],
  ["wegmans", "Wegmans", "www.wegmans.com", "https://www.wegmans.com/"],
  ["unitedsupermarkets", "United Supermarkets", "www.unitedsupermarkets.com", "https://www.unitedsupermarkets.com/"],
  ["amexoffers", "Amex Offers", "global.americanexpress.com", "https://global.americanexpress.com/offers"],
  ["citioffers", "Citi Merchant Offers", "online.citi.com", "https://online.citi.com/"],
  ["bofadeals", "BankAmeriDeals", "secure.bankofamerica.com", "https://www.bankofamerica.com/"],
  ["capitaloneoffers", "Capital One Offers", "capitaloneoffers.com", "https://capitaloneoffers.com/"],
].map(([id, name, host, url]) => ({ id, name, host, url, adapter: null, comingSoon: true }));

export const STORES = [
  { id: "heb", name: "H-E-B", adapter: "heb", host: "www.heb.com", url: "https://www.heb.com/digital-coupon/coupon-selection/all-coupons" },
  { id: "target", name: "Target Circle", adapter: "target", host: "www.target.com", url: "https://www.target.com/deals/all?facet=tap_to_apply" },
  { id: "cvs", name: "CVS ExtraCare", adapter: "cvs", host: "www.cvs.com", url: "https://www.cvs.com/extracare/home" },
  { id: "bjs", name: "BJ's", adapter: "bjs", host: "www.bjs.com", url: "https://www.bjs.com/myCoupons" },
  { id: "walgreens", name: "Walgreens", adapter: "walgreens", host: "www.walgreens.com", url: "https://www.walgreens.com/offers/offers.jsp" },
  ...krogerFamily,
  ...albertsonsFamily,
  { id: "walmart", name: "Walmart Cash", adapter: "walmart", host: "www.walmart.com", url: "https://www.walmart.com/offer/all-offers" },
  { id: "chaseoffers", name: "Chase Offers", adapter: "chase", host: "secure.chase.com", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offerCategoriesPage?offerCategoryName=ALL", noDaily: true },
  ...inDevelopment,
];

export const runnable = (s) => !s.comingSoon;

// Pinned stores first, then the user's dragged order, then list order.
export function sortStores(stores, settings) {
  const order = settings?.order || [];
  const rank = (s) => {
    const i = order.indexOf(s.id);
    return i === -1 ? order.length + stores.indexOf(s) : i;
  };
  const pinned = (s) => (settings?.pinned?.[s.id] ? 1 : 0);
  return [...stores].sort((a, b) => pinned(b) - pinned(a) || rank(a) - rank(b));
}

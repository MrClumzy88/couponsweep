// Rebate (cash-back) apps. The popup's "Get cash back too" section explains
// the steps and opens the right page so the user can add offers themselves.
// The opt-in Ibotta adapter (content/ibotta.js) uses the same store pages;
// Ibotta's terms ban "programmatic means", so it sits behind its own warning.

const IBOTTA = "https://ibotta.com";

// Ibotta's offer page for each store (from ibotta.com/categories/Grocery/88).
// Signed-in form (/retailers/<name>/<id>); the public /retailers/groups/…
// links answer "couldn't find that retailer" once you're signed in.
const IBOTTA_STORE = {
  kroger: "/retailers/Kroger/7",
  ralphs: "/retailers/Ralphs/8",
  frysfood: "/retailers/Frys/16",
  kingsoopers: "/retailers/King_Soopers/1",
  fredmeyer: "/retailers/Fred_Meyer/13",
  smithsfoodanddrug: "/retailers/Smiths/15",
  qfc: "/retailers/QFC/42",
  dillons: "/retailers/Dillons/27",
  citymarket: "/retailers/City_Market_(CO)/26",
  bakersplus: "/retailers/Bakers/64",
  gerbes: "/retailers/Gerbes/65",
  jaycfoods: "/retailers/Jay_C/66",
  "pay-less": "/retailers/Pay_Less/68",
  marianos: "/retailers/Marianos/218",
  metromarket: "/retailers/Metro_Market/219",
  foodsco: "/retailers/Foods_Co/71",
  food4less: "/retailers/Food4Less/41",
  albertsons: "/retailers/Albertsons/212",
  tomthumb: "/retailers/Tom_Thumb/20",
  safeway: "/retailers/Safeway/2",
  vons: "/retailers/Vons/11",
  randalls: "/retailers/Randalls/31",
  jewelosco: "/retailers/Jewel-Osco/214",
  acmemarkets: "/retailers/ACME/213",
  shaws: "/retailers/Shaws/215",
  starmarket: "/retailers/Star_Market/216",
  pavilions: "/retailers/Pavilions/17",
  haggen: "/retailers/Haggen_Northwest_Fresh/323",
  kingsfoodmarkets: "/retailers/Kings_Food_Markets/1345",
  shopunitedsupermarkets: "/retailers/United_Supermarkets/250",
  shopmarketstreet: "/retailers/Market_Street/251",
  shopalbertsonsmarket: "/retailers/Albertsons_Market/340",
  heb: "/retailers/H-E-B/25",
  target: "/retailers/Target/3",
  bjs: "/retailers/BJs_Wholesale_Club/193",
  walmart: "/retailers/Walmart/4",
  // In development here, but already on Ibotta.
  publix: "/retailers/Publix/9",
  meijer: "/retailers/Meijer/19",
  shoprite: "/retailers/ShopRite/24",
  stopandshop: "/retailers/Stop_and_Shop/23",
  giantfood: "/retailers/Giant_(DCDEVAMD)/133",
  foodlion: "/retailers/Food_Lion/49",
  hannaford: "/retailers/Hannaford/36",
  dollargeneral: "/retailers/Dollar_General/34",
  harristeeter: "/retailers/Harris_Teeter/29",
  wegmans: "/retailers/Wegmans/43",
};

export const ibottaStoreUrl = (id) => (IBOTTA_STORE[id] ? IBOTTA + IBOTTA_STORE[id] : null);
export const IBOTTA_ALL_GROCERY = `${IBOTTA}/categories/Grocery/88`;
export const CHECKOUT51 = "https://www.checkout51.com/";
export const FETCH = "https://fetch.com/";

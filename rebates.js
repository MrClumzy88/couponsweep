// Rebate (cash-back) apps. CouponSweep doesn't touch these accounts: Ibotta's
// terms ban "programmatic means", and a banned account loses its cash. The
// popup only explains the steps and opens the right page so the user clicks
// the offers themselves.

const IBOTTA = "https://ibotta.com";

// Ibotta's offer page for each store (from ibotta.com/categories/Grocery/88).
// These pages need an Ibotta sign-in; Ibotta asks for it first if needed.
const IBOTTA_STORE = {
  kroger: "/retailers/groups/Kroger?ids=7",
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
  albertsons: "/retailers/groups/Albertsons?ids=212",
  tomthumb: "/retailers/groups/Tom_Thumb?ids=20",
  safeway: "/retailers/groups/Safeway?ids=2",
  vons: "/retailers/groups/Vons?ids=11",
  randalls: "/retailers/groups/Randalls?ids=31",
  jewelosco: "/retailers/groups/Jewel-Osco?ids=214",
  acmemarkets: "/retailers/groups/ACME?ids=213",
  shaws: "/retailers/groups/Shaws?ids=215",
  starmarket: "/retailers/groups/Star_Market?ids=216",
  pavilions: "/retailers/groups/Pavilions?ids=17",
  haggen: "/retailers/Haggen_Northwest_Fresh/323",
  kingsfoodmarkets: "/retailers/Kings_Food_Markets/1345",
  shopunitedsupermarkets: "/retailers/United_Supermarkets/250",
  shopmarketstreet: "/retailers/Market_Street/251",
  shopalbertsonsmarket: "/retailers/Albertsons_Market/340",
  heb: "/retailers/groups/H-E-B?ids=25",
  target: "/retailers/groups/Target?ids=3",
  bjs: "/retailers/groups/BJs_Wholesale_Club?ids=193",
  walmart: "/retailers/groups/Walmart?ids=4&ids=1408",
  // In development here, but already on Ibotta.
  publix: "/retailers/Publix/9",
  meijer: "/retailers/groups/Meijer?ids=19",
  shoprite: "/retailers/ShopRite/24",
  stopandshop: "/retailers/groups/Stop_and_Shop?ids=23",
  giantfood: "/retailers/Giant_(DCDEVAMD)/133",
  foodlion: "/retailers/Food_Lion/49",
  hannaford: "/retailers/groups/Hannaford?ids=36",
  dollargeneral: "/retailers/groups/Dollar_General?ids=34&ids=5081",
  harristeeter: "/retailers/Harris_Teeter/29",
  wegmans: "/retailers/Wegmans/43",
};

export const ibottaStoreUrl = (id) => (IBOTTA_STORE[id] ? IBOTTA + IBOTTA_STORE[id] : null);
export const IBOTTA_ALL_GROCERY = `${IBOTTA}/categories/Grocery/88`;
export const CHECKOUT51 = "https://www.checkout51.com/";
export const FETCH = "https://fetch.com/";

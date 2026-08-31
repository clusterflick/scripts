const { format, addMonths } = require("date-fns");

// The museum's ticketing API answers with every production on sale and, on
// each, its performances - so one call carries the whole schedule. Shared with
// the health probe, which makes the same call: it is a POST with a required
// date window, and none of that is guessable from the outside.
const LISTING_URL =
  "https://my.sciencemuseum.org.uk/api/products/productionseasons";

const getListingRequest = (now = new Date()) => [
  LISTING_URL,
  {
    method: "POST",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productionSeasonIdFilter: [],
      keywordIds: null,
      startDate: `${format(now, "yyyy-MM-dd")}T00:00`,
      // Only request 6 months ahead. The science museum doesn't schedule
      // further ahead than that, and requesting 1 year returns an error.
      endDate: `${format(addMonths(now, 6), "yyyy-MM-dd")}T23:59`,
      keywords: [],
    }),
  },
];

// The museum sells planetarium shows, workshops and simulator rides alongside
// its IMAX programme, and tells them apart by product type. 3 is Movie.
const MOVIE_PRODUCT_TYPE_ID = 3;

const isFilmProduction = ({ performances }) =>
  performances[0]?.productTypeId === MOVIE_PRODUCT_TYPE_ID;

// "The Odyssey (15)" and "The Odyssey (12A)" are the same film on two
// certificates, and a season lists its films this way under one production.
const stripClassification = (title) => `${title}`.replace(/\s+\([^)]+\)$/i, "");

module.exports = {
  getListingRequest,
  isFilmProduction,
  stripClassification,
};

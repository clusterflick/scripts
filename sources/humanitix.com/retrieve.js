const { fetchJson, fetchText } = require("../../common/utils.js");
const { getEventUrl } = require("./utils");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0";

const API_URL = "https://humanitix.com/api/recommendations";

const GEOBOX = {
  slug: "gb--england--london",
  breadcrumbs: [
    { label: "United Kingdom", link: "united-kingdom" },
    { label: "England", link: "gb--england" },
    { label: "London", link: "gb--england--london" },
  ],
  countryCode: "gb",
  name: "London",
  address: "London, UK",
  latLng: { lat: 51.5072178, lng: -0.1275862 },
  northeast: { lat: 51.6723432, lng: 0.148271 },
  southwest: { lat: 51.38494009999999, lng: -0.3514683 },
  area: 1104.7930597176419,
  placeId: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
};

async function fetchPage(page) {
  return fetchJson(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "content-type": "application/json",
      Accept: "*/*",
    },
    body: JSON.stringify({
      query: "",
      locationQuery: "",
      locationType: "",
      types: [],
      categories: ["filmMediaAndEntertainment"],
      subcategories: [],
      interests: [],
      prices: "all",
      dates: "",
      startDate: "",
      endDate: "",
      accessibility: [],
      page,
      safeSearch: true,
      category: "filmMediaAndEntertainment",
      geobox: GEOBOX,
    }),
  });
}

async function retrieve() {
  const allEvents = [];
  let page = 0;

  while (true) {
    const pageEvents = await fetchPage(page);
    if (pageEvents.length === 0) break;
    allEvents.push(...pageEvents);
    page += 1;
  }

  // The search results carry no description, so each event's own page is
  // fetched for it - without one, matching and the film-listing filter have
  // only the title to go on.
  const eventPages = {};
  for (const event of allEvents) {
    const url = getEventUrl(event);
    if (eventPages[url]) continue;
    eventPages[url] = await fetchText(url, {
      headers: { "User-Agent": USER_AGENT },
    });
  }

  return { events: allEvents, eventPages };
}

module.exports = retrieve;

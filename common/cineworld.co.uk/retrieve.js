const boxofficeapiRetrieve = require("../boxofficeapi/retrieve");
const { retryThroughCamoufox } = require("../camoufox-escalation");
const { describeRefusal } = require("../camoufox-site-page");
const { requestFromPage, withCineworldPage } = require("./browser");

const LISTING_PATH = "cinemas";
const CACHE_PREFIX = "cineworld";

const overBrowser = (page) => {
  const request = async (url) => {
    const response = await requestFromPage(page, url);
    if (!response.ok) {
      const error = new Error(
        `Failed to fetch ${url} from inside a Cineworld page - ${describeRefusal(response)}`,
      );
      error.status = response.status;
      throw error;
    }
    return response.body;
  };
  return {
    text: request,
    json: async (url) => JSON.parse(await request(url)),
  };
};

// The whole retrieve again, with the calls to Cineworld made from a page in
// Camoufox.
const retrieveWithBrowser = (attributes) =>
  withCineworldPage(
    `${attributes.domain}/${LISTING_PATH}`,
    `${CACHE_PREFIX}-browser-${attributes.id}`,
    (page) =>
      boxofficeapiRetrieve(attributes, {
        listingPath: LISTING_PATH,
        cachePrefix: CACHE_PREFIX,
        transport: overBrowser(page),
      }),
    { label: "Cineworld page" },
  );

// Escalate on any 403, not only a labelled challenge. From the self-hosted
// runners the refusal arrives without `cf-mitigated`, and a browser launch on a
// run that is already failing is the cheaper mistake. The browser path reports
// which kind of refusal it met.
const retrieve = (attributes) =>
  retryThroughCamoufox(
    () =>
      boxofficeapiRetrieve(attributes, {
        listingPath: LISTING_PATH,
        cachePrefix: CACHE_PREFIX,
      }),
    () => retrieveWithBrowser(attributes),
    { isRefusal: (error) => error.status === 403 },
  );

module.exports = retrieve;

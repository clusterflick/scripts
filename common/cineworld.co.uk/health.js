const boxofficeapiHealth = require("../boxofficeapi/health");
const { classifyPage, parseProbeJson, probeJson } = require("../health-probe");
const { requestFromPage, withCineworldPage } = require("./browser");

const DOMAIN = "https://www.cineworld.co.uk";

// Direct first, as every other boxofficeapi probe is, and through a Cineworld
// page in Camoufox only once that is refused - see `browser.js` for why the
// browser is needed at all. Escalating per call rather than always opening the
// browser keeps the probe at two plain requests on any cycle Cineworld lets
// them through.
const withSession = async (fn) => {
  try {
    return await fn(probeJson);
  } catch (error) {
    if (error.reason?.kind !== "bot-challenge") throw error;
    console.log(" ! - Refused directly; retrying through Camoufox ...");
  }

  return withCineworldPage(
    `${DOMAIN}/cinemas`,
    // Never read - the cache is off - but named apart from the retrieve's.
    "health--cineworld.co.uk",
    (page) =>
      fn(async (url) => parseProbeJson(url, await requestFromPage(page, url))),
    {
      // An hourly probe must not replay the first answer of the day.
      disableCache: true,
      onUnsettled: (page, response) =>
        classifyPage(page, response, `No Cineworld page at ${DOMAIN}/cinemas`),
    },
  );
};

async function health(venues) {
  return boxofficeapiHealth(venues, DOMAIN, { withSession });
}

module.exports = health;

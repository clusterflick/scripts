const boxofficeapiRetrieve = require("../boxofficeapi/retrieve");
const { BOT_CHALLENGE_TEXT, isBotBlockText } = require("../bot-challenge");
const { requestFromPage, withCineworldPage } = require("./browser");

const LISTING_PATH = "cinemas";
const CACHE_PREFIX = "cineworld";

// Say which refusal it was: a challenge Camoufox failed to solve and an outright
// block need different next steps, and a bare 403 says neither.
const describeRefusal = ({ status, statusText, cfMitigated, body }) => {
  if (cfMitigated === "challenge") return `${status} challenge (cf-mitigated)`;
  if (isBotBlockText(body)) return `${status} blocked outright`;
  if (BOT_CHALLENGE_TEXT.test(body)) return `${status} challenge (page copy)`;
  return `${status} ${statusText}`;
};

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
// Camoufox. Restarting rather than resuming: whatever the direct attempt already
// fetched is in the day cache, so the restart only repeats what failed.
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
    {
      onUnsettled: async (page, response, error) =>
        new Error(
          isBotBlockText(await page.content().catch(() => null))
            ? `Blocked outright (not challenged) at ${page.url()} - the request was refused, not scored`
            : `Cineworld page never loaded past the challenge (${error.message})`,
        ),
    },
  );

async function retrieve(attributes) {
  try {
    return await boxofficeapiRetrieve(attributes, {
      listingPath: LISTING_PATH,
      cachePrefix: CACHE_PREFIX,
    });
  } catch (error) {
    // Escalate on any 403, not only a labelled challenge. From the self-hosted
    // runners the refusal arrives without `cf-mitigated`, and a browser launch
    // on a run that is already failing is the cheaper mistake. The browser
    // path reports which kind of refusal it met.
    if (error.status !== 403) throw error;

    console.log(
      "    - Refused with a 403; retrying through Camoufox, which carries a browser fingerprint and can solve a challenge",
    );
    return await retrieveWithBrowser(attributes);
  }
}

module.exports = retrieve;

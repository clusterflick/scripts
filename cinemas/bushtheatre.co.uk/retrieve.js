const cheerio = require("cheerio");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { getId } = require("../../common/utils");
const attributes = require("./attributes");

// This retrieve used to swallow every error and return an empty listing, added
// in August 2026 while the site was answering 500. That hid every later
// failure too - a block, a timeout, a changed page - as Bush Theatre having
// nothing on. A venue that is known to be shut belongs in
// common/expected-closures.js instead.
//
// On 19th November 2026 the site answered the runner's first request with a
// "One moment, please... Please wait while your request is being verified"
// interstitial in place of its listing. So each page is tried with a plain
// fetch first and the session escalates to Camoufox at the first refusal, as
// Close-Up's and the Cinema Museum's do - see `common/camoufox-escalation.js`.
//
// Each page type has a selector only the real page carries, so an interstitial
// served with a 200 can't be mistaken for content. The listing's is the link
// to each event; an event page's is its "About" block, which every event page
// carries whatever else it lists.
const EVENT_LIST_PAGE_SELECTOR = ".events_listing .events_item__link";
const EVENT_PAGE_SELECTOR = ".event_about";

// One cache entry per page, so a rerun after a failure part-way through
// resumes rather than paying for every page again - which matters once each
// costs a browser load. The hash keeps the key unique; the slug keeps the cache
// directory readable.
const getCacheKey = (url) => {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
  return `${attributes.id}-${getId(url)}-${slug}`;
};

const getPageContent = (getPage, url, selector) =>
  getPageEscalating(getPage, url, getCacheKey(url), { selector });

async function retrieveListings(getPage) {
  const eventListPage = await getPageContent(
    getPage,
    attributes.url,
    EVENT_LIST_PAGE_SELECTOR,
  );
  const $ = cheerio.load(eventListPage);

  const eventPageUrls = new Set();
  $(EVENT_LIST_PAGE_SELECTOR).each(function () {
    const href = $(this).attr("href");
    if (href) eventPageUrls.add(new URL(href, attributes.url).href);
  });

  const eventPages = [];
  for (const eventPageUrl of eventPageUrls) {
    eventPages.push(
      await getPageContent(getPage, eventPageUrl, EVENT_PAGE_SELECTOR),
    );
  }

  return {
    eventListPage,
    eventPages,
  };
}

const retrieve = () => withCamoufoxSession(retrieveListings);

module.exports = retrieve;

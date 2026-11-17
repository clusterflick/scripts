const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { id, domain } = require("./attributes");

// The site sits behind Cloudflare, which on 17th November 2026 began answering
// GitHub's runners with a Managed Challenge (`403`, `cf-mitigated: challenge`)
// on every attempt across three fresh VMs, while a plain request from elsewhere
// still got the real page. So the listing is tried with a plain fetch first and
// the session escalates to Camoufox at a refusal - see
// `common/camoufox-escalation.js`.
//
// Every film on the listing is a `.jacro-event`, and a challenge page can't
// carry one, so it is what tells the real page apart and what the browser waits
// for while the challenge clears. The whole programme is this one page.
const MOVIE_LIST_PAGE_URL = `${domain}/whats-on/`;
const MOVIE_LIST_PAGE_SELECTOR = ".jacro-event";

async function retrieve() {
  return withCamoufoxSession(async (getPage) => {
    const movieListPage = await getPageEscalating(
      getPage,
      MOVIE_LIST_PAGE_URL,
      `${id}-listing`,
      { selector: MOVIE_LIST_PAGE_SELECTOR },
    );
    return { movieListPage };
  });
}

module.exports = retrieve;

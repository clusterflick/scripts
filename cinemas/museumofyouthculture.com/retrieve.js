const { fetchText } = require("../../common/utils");
const { getExpectedClosure } = require("../../common/expected-closures");
const { id, url } = require("./attributes");
const { parseEvents } = require("./utils");

async function retrieve() {
  try {
    const movieListPage = await fetchText(url);
    // Parsed here too, so a page that has changed shape fails at retrieve
    // rather than saving something the transform can't read.
    parseEvents(movieListPage);
    return { movieListPage };
  } catch (error) {
    // While the host has the site suspended every page redirects to cPanel's
    // "Account Suspended" page, which has no listings to parse. Stand down only
    // for a declared closure, and not narrowed to that page, for the reason
    // Fulham Pier's retrieve gives: whatever shape the outage takes, today's
    // answer is the same, the window is a single day and the swallowed error
    // is logged in full.
    const closure = getExpectedClosure(id);
    if (!closure) throw error;

    console.log(
      `      - ⚠️  Unable to retrieve ${id} - closed until ${closure.until} for ${closure.reason}: ${error.message}`,
    );
    return { movieListPage: null };
  }
}

module.exports = retrieve;

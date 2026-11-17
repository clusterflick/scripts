const { fetchJson } = require("../../common/utils");
const { getExpectedClosure } = require("../../common/expected-closures");
const { id } = require("./attributes");

async function retrieve() {
  const apiUrl =
    "https://dzxpxc606eoab.cloudfront.net/Prod/events/20/72165/Live";
  const allEvents = await fetchJson(apiUrl);

  // The feed is every event the Hall has on sale - concerts, talks, family
  // shows as well as films - so it is never empty while the Hall is open. On
  // 17th November 2026 it answered a retrieve with `[]` under a 200 and a few
  // hours later with 125 events, and the empty answer was released, failing
  // the transform long after a retry could have helped. So an empty feed throws
  // here, where the step's retries can catch it, unless the venue is declared
  // shut - the same carve-out the transform makes.
  if (!Array.isArray(allEvents) || allEvents.length === 0) {
    const closure = getExpectedClosure(id);
    if (!closure) {
      throw new Error(
        `Expected a list of events from ${apiUrl}, got ${JSON.stringify(allEvents)}`,
      );
    }
    console.log(
      `      - ⚠️  No events for ${id} - closed until ${closure.until} for ${closure.reason}`,
    );
    return [];
  }

  return allEvents;
}

module.exports = retrieve;

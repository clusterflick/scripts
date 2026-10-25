const { fetchJson } = require("../../common/utils");
const { url } = require("./attributes");

// A Squarespace events page answers with its collection as JSON when asked,
// with everything still to come under `upcoming`.
async function retrieve() {
  const response = await fetchJson(`${url}?format=json`);
  if (!Array.isArray(response.upcoming)) {
    throw new Error(
      `No upcoming events list in ${url}?format=json - the page structure may have changed`,
    );
  }

  // Squarespace pages the past list; whether it would page the upcoming one
  // too is unconfirmed, so a full page of upcoming events is taken as a sign
  // that it has - anything past it would otherwise be silently missing.
  const pageSize = response.pagination?.pageSize;
  if (pageSize && response.upcoming.length >= pageSize) {
    throw new Error(
      `${response.upcoming.length} upcoming events fills a page of ${pageSize} - the list may be truncated`,
    );
  }

  return { events: response.upcoming };
}

module.exports = retrieve;

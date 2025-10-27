const { fetchJson } = require("../../common/utils");

async function retrieve() {
  const apiUrl =
    "https://dzxpxc606eoab.cloudfront.net/Prod/events/20/72165/Live";
  const allEvents = await fetchJson(apiUrl);
  return allEvents;
}

module.exports = retrieve;

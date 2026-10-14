const fetchHostedSource = require("../../common/host-non-web-sources/fetch-source");
const validateFestivals = require("./validate-festivals");

// Small festivals that run a night or two a year aren't worth a scraper of
// their own - their pages are one-offs, rarely change once the programme is
// out, and would break unnoticed between editions. Their programmes are
// transcribed into one file in host-non-web-sources instead.
async function retrieve() {
  const festivals = JSON.parse(await fetchHostedSource("festivals.json"));
  // Checked here as well as in findEvents so a typo fails the retrieve job,
  // rather than surfacing later in every venue's transform.
  validateFestivals(festivals);
  return { festivals };
}

module.exports = retrieve;

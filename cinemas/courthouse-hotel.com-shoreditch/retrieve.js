const fetchHostedSource = require("../../common/host-non-web-sources/fetch-source");
const attributes = require("./attributes");

// The venue publishes its whole year as a PDF poster rather than a listings
// page - one film every Sunday - so the programme is transcribed to CSV and
// hosted. When they upload the following year's PDF, the CSV is replaced.
async function retrieve() {
  return { csvText: await fetchHostedSource(attributes.id) };
}

module.exports = retrieve;

const fetchHostedSource = require("../../common/host-non-web-sources/fetch-source");

// This venue's listings arrive as a monthly email rather than a poster, so the
// hosted file is named for the address they are sent to instead of the venue id.
const SOURCE_NAME = "deptfortlibrarycinemaclub@clusterflick.com";

async function retrieve() {
  return { emailText: await fetchHostedSource(SOURCE_NAME) };
}

module.exports = retrieve;

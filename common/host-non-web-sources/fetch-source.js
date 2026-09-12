const { fetchText } = require("../utils");
require("dotenv").config();

// Some venues publish no listings a scraper can read - an annual PDF poster, or
// a monthly email to subscribers. Those are transcribed by hand and kept in
// clusterflick/host-non-web-sources, one file per venue named after its id, and
// fetched from there like any other source.
const BASE_URL =
  "https://raw.githubusercontent.com/clusterflick/host-non-web-sources/refs/heads/main";

/**
 * The text of one venue's file in the host-non-web-sources repo.
 *
 * @param {string} name - The file's name, which is the venue's id (or, for a
 *   venue whose listings arrive by email, the address they are sent to)
 * @returns {Promise<string>} The file's contents
 */
async function fetchHostedSource(name) {
  const url = `${BASE_URL}/${encodeURIComponent(name)}`;
  const text = await fetchText(url);

  // GitHub answers a missing or renamed file with a JSON error body rather than
  // a failed request, which would otherwise reach the venue's transform as a
  // listing it cannot parse.
  let errorResponse;
  try {
    errorResponse = JSON.parse(text);
  } catch {
    //
  }

  if (errorResponse) {
    throw new Error(errorResponse.message);
  }

  if (!text) {
    throw new Error(`Failed to fetch ${name} - empty response`);
  }

  return text;
}

module.exports = fetchHostedSource;

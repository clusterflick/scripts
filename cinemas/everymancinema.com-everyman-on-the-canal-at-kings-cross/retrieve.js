const { fetchText } = require("../../common/utils");
require("dotenv").config();

const SOURCE_URL =
  "https://raw.githubusercontent.com/clusterflick/host-non-web-sources/refs/heads/main/everymancinema.com-everyman-on-the-canal-at-kings-cross";

async function retrieve() {
  const csvText = await fetchText(SOURCE_URL);

  let errorResponse;
  try {
    // If we can parse this as JSON, then it's not a valid CSV
    errorResponse = JSON.parse(csvText);
  } catch {
    //
  }

  if (errorResponse) {
    throw new Error(errorResponse.message);
  }

  if (!csvText) {
    throw new Error("Failed to fetch CSV - empty response");
  }

  return { csvText };
}

module.exports = retrieve;

const { fetchText } = require("../../common/utils");
require("dotenv").config();

const SOURCE_URL =
  "https://raw.githubusercontent.com/clusterflick/host-non-web-sources/refs/heads/main/deptfortlibrarycinemaclub%40clusterflick.com";

async function retrieve() {
  const emailText = await fetchText(SOURCE_URL);

  let errorResponse;
  try {
    // If we can parse this as JSON, then it's not a valid email text
    errorResponse = JSON.parse(emailText);
  } catch {
    //
  }

  if (errorResponse) {
    throw new Error(errorResponse.message);
  }

  if (!emailText) {
    throw new Error("Failed to fetch email text - empty response");
  }

  return { emailText };
}

module.exports = retrieve;

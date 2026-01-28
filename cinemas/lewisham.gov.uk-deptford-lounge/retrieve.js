const { fetchText } = require("../../common/utils");
require("dotenv").config();

const SOURCE_URL =
  "https://api.github.com/repos/clusterflick/host-non-web-sources/contents/deptfortlibrarycinemaclub%40clusterflick.com";

async function retrieve() {
  const emailText = await fetchText(SOURCE_URL, {
    headers: {
      Accept: "application/vnd.github.v3.raw",
      Authorization: `Bearer ${process.env.PAT}`,
    },
  });

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

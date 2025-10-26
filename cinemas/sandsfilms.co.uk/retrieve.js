const { fetchText, fetchJson } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  // Request the HTML from the welcome page so we can extract the tenant script
  const welcomePage = await fetchText(`${url}/welcome`);
  const tenantScriptMatch = welcomePage.match(
    /<script data-type="tenant" src="([^"]+)"><\/script>/,
  );
  if (!tenantScriptMatch) {
    throw new Error("Could not find tenant script URL in welcome page");
  }
  const tenantScriptPath = tenantScriptMatch[1];

  // Request the JavaScript for the tenant script so we can extract the API key
  const tenantScript = await fetchText(`${url}${tenantScriptPath}`);
  const apiKeyMatch = tenantScript.match(/,"api_key":"([^"]+)",/);
  if (!apiKeyMatch) {
    throw new Error("Could not find API key in tenant script");
  }
  const apiKey = apiKeyMatch[1];

  // Request event data from the API using the API key
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  const eventsUrl =
    "https://api.eventive.org/event_buckets/6161a93f49ddeb00acf3f48c/events?upcoming_only=true";
  const movieListPage = await fetchJson(eventsUrl, {
    headers: { Authorization: authHeader },
  });

  return { movieListPage };
}

module.exports = retrieve;

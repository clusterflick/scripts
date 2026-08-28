const { fetchText, fetchJson } = require("../utils");

const EVENTIVE_API = "https://api.eventive.org";

/**
 * Every Eventive tenant is its own subdomain, and none of them expose the ids
 * an API call needs. They are reachable all the same: the welcome page names a
 * per-deploy tenant script, and that script carries both the public API key and
 * the tenant's event bucket. Walking the chain rather than hardcoding the
 * bucket keeps a tenant to a URL, and means a bucket swapped out on Eventive's
 * side is followed rather than silently returning someone else's listings.
 */
async function retrieve(url) {
  // Request the HTML from the welcome page so we can extract the tenant script
  const welcomePage = await fetchText(`${url}/welcome`);
  const tenantScriptMatch = welcomePage.match(
    /<script data-type="tenant" src="([^"]+)"><\/script>/,
  );
  if (!tenantScriptMatch) {
    throw new Error(`Could not find tenant script URL in ${url}/welcome`);
  }
  const tenantScriptPath = tenantScriptMatch[1];

  // Request the JavaScript for the tenant script so we can extract the API key
  // and the event bucket the tenant's listings live in
  const tenantScript = await fetchText(`${url}${tenantScriptPath}`);
  const apiKeyMatch = tenantScript.match(/"api_key":"([^"]+)"/);
  if (!apiKeyMatch) {
    throw new Error(`Could not find API key in tenant script for ${url}`);
  }
  const apiKey = apiKeyMatch[1];

  const eventBucketMatch = tenantScript.match(
    /"event_bucket":"([0-9a-f]{24})"/,
  );
  if (!eventBucketMatch) {
    throw new Error(`Could not find event bucket in tenant script for ${url}`);
  }
  const eventBucket = eventBucketMatch[1];

  // Request event data from the API using the API key
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  const eventsUrl = `${EVENTIVE_API}/event_buckets/${eventBucket}/events?upcoming_only=true`;
  return fetchJson(eventsUrl, {
    headers: { Authorization: authHeader },
  });
}

module.exports = retrieve;

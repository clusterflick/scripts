// TEMPORARY: the site's host has been dropping every connection from the
// self-hosted runners since 17th November 2026 (`UND_ERR_CONNECT_TIMEOUT`,
// even on a freshly rotated IP), which voids the whole retrieve. It had no
// upcoming film club events that morning - a live retrieve returned no list
// pages - so this returns that same empty state without making a request,
// to let the release out. Revert once the source has moved to a runner the
// host accepts.
async function retrieve() {
  return { movieListPages: [] };
}

module.exports = retrieve;

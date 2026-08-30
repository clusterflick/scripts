// Every venue on this platform is the same site behind a different `site_id`
// cookie: the endpoint, the variables and the headers are identical, only the
// cookie and the query differ. Shared with the health probe, which asks the same
// endpoint the same way with a smaller query, and would otherwise be a second
// place for the request shape to drift.
const variables = {
  limit: 1000,
  orderBy: "magic",
  type: "all-published",
};

const listingRequest = ({ domain, siteId }, query) => [
  `${domain}/graphql`,
  {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json",
      "client-type": "consumer",
      cookie: `site_id=${siteId}`,
    },
  },
];

module.exports = { listingRequest };

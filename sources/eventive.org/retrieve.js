const eventiveRetrieve = require("../../common/eventive/retrieve");
const tenants = require("./tenants");

async function retrieve() {
  const tenantEvents = {};

  for (const tenant of tenants) {
    // A tenant that can't be reached is a breakage worth failing on - the
    // handshake changing, or a subdomain retired without its entry being
    // removed. A tenant that answers with nothing upcoming is not: a festival
    // between editions has no events, and that is the correct answer.
    const { events } = await eventiveRetrieve(tenant.url);
    tenantEvents[tenant.id] = events;
  }

  return { tenantEvents };
}

module.exports = retrieve;

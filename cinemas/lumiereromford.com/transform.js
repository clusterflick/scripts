const attributes = require("./attributes");
const cinesyncTransform = require("../../common/cinesync.io/transform");

async function transform(data, sourcedEvents) {
  const events = await cinesyncTransform(attributes, data, sourcedEvents);
  return events.filter(({ title }) => {
    const normalized = title.trim().toLowerCase();
    // Remove Basking Babies events (e.g. "Baby Yoga Classes")
    // "At Lumiere, we are more than just a cinema, we are a community space for
    // a variety of activities - from art classes to meditation to exercise."
    if (normalized.endsWith("basking babies")) return false;
    // Remove placeholder test entry
    if (normalized === "test film") return false;
    return true;
  });
}

module.exports = transform;

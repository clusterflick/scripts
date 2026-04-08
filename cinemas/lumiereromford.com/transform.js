const attributes = require("./attributes");
const cinesyncTransform = require("../../common/cinesync.io/transform");

async function transform(data, sourcedEvents) {
  const events = await cinesyncTransform(attributes, data, sourcedEvents);
  return events.filter(({ title }) => {
    // Remove Basking Babies events (e.g. "Baby Yoga Classes")
    // "At Lumiere, we are more than just a cinema, we are a community space for
    // a variety of activities - from art classes to meditation to exercise."
    return !title.trim().toLowerCase().endsWith("basking babies");
  });
}

module.exports = transform;

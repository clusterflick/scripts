const sourceOnlyTransform = require("../../common/source-only/transform");

const privateEvents = [/Private Cinema Watch Party/i];

const isNotPrivateEvent = ({ title }) =>
  !privateEvents.some((pattern) => title.match(pattern));

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);
  return events.filter(isNotPrivateEvent);
}

module.exports = transform;

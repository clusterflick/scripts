const path = require("node:path");
const { readJSON } = require("../../common/utils");
const normalizeName = require("../../common/normalize-name");
const distanceInKmBetweenCoordinates = require("../../common/distance-in-km-between-coordinates");
const { createOverview, createPerformance } = require("../../common/utils");
const { parseDate } = require("./utils");

function convertEventbriteEvent(event) {
  const startDate = parseDate(`${event.start_date}T${event.start_time}`);
  const endDate = parseDate(`${event.end_date}T${event.end_time}`);

  return {
    title: event.name,
    url: event.url,
    overview: createOverview({
      duration: (endDate.getTime() - startDate.getTime()) / 1000 / 60,
    }),
    performances: [
      createPerformance({
        date: startDate,
        notesList: [],
        url: event.tickets_url,
      }),
    ],
  };
}

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

async function findEvents(cinema) {
  const root = path.join(__dirname, "..", "..");
  const dataSrc = path.join(root, "retrieved-data", "eventbrite.co.uk");
  const data = await readJSON(dataSrc);

  const events = uniqueEvents(
    data.flatMap(
      ({
        search_data: {
          events: { results },
        },
      }) => results,
    ),
  );

  const filteredEvents = events.filter(
    ({
      is_cancelled: isCancelled,
      is_online_event: isOnline,
      primary_venue: {
        name,
        address: { longitude: lon, latitude: lat },
      },
    }) => {
      if (isCancelled || isOnline) return false;
      const distance = distanceInKmBetweenCoordinates(cinema.geo, { lat, lon });
      const [venueName] = name.split(",");
      return (
        normalizeName(venueName) === normalizeName(cinema.name) &&
        distance < 0.1
      );
    },
  );

  return filteredEvents.map(convertEventbriteEvent);
}

module.exports = findEvents;

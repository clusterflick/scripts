const attributes = require("./attributes");
const { removeAlreadyListedPerformances } = require("../../common/utils");
const cinesyncTransform = require("../../common/cinesync.io/transform");
const withoutScreeningsListedByCinematik = require("../../sources/cinematik.app-/without-screenings-listed-by-venue");

async function transform(data, sourcedEvents) {
  const movies = await cinesyncTransform(attributes, data, {});

  // Sources that only link out to the Lumiere's booking pages find screenings
  // it already lists, so those copies are dropped: at the same address, or -
  // for Cinematik, which links the film's showtimes for the day rather than
  // the screening's seat plan - at the same film, day and time. Anything a
  // source finds that the venue doesn't list stays.
  const listOfSourcedEvents = removeAlreadyListedPerformances(
    movies,
    Object.values(
      withoutScreeningsListedByCinematik(movies, sourcedEvents),
    ).flatMap((events) => events),
    { venueDomain: attributes.domain },
  ).filter(({ performances }) => performances.length > 0);

  return movies.concat(listOfSourcedEvents).filter(({ title }) => {
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

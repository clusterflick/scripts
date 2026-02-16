const { getDay } = require("date-fns");
const attributes = require("./attributes");
const admitOneTransform = require("../../common/admit-one.co.uk/transform");

const TUESDAY = 2;
const THURSDAY = 4;

async function transform(data, sourcedEvents) {
  const movies = await admitOneTransform(attributes, data, sourcedEvents);

  // "Our hard of hearing screenings are on Tuesdays and Thursdays."
  // https://www.genesiscinema.co.uk/whatson/subtitled
  for (const movie of movies) {
    for (const performance of movie.performances) {
      if (!performance.accessibility.subtitled) continue;
      const dayOfWeek = getDay(performance.time);
      if (dayOfWeek === TUESDAY || dayOfWeek === THURSDAY) {
        performance.accessibility.hardOfHearing = true;
      }
    }
  }

  return movies;
}

module.exports = transform;

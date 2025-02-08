const { sortAndFilterMovies } = require("../../common/utils");
const getSourcedEventsFor = require("./get-sourced-events-for");

async function transform(location, input) {
  const { transform, attributes } = require(`../cinemas/${location}`);
  const sourcedEvents = await getSourcedEventsFor(attributes);

  console.log(`[🎞️  Cinema: ${location}] Transforming data ...`);

  let output;
  try {
    const start = Date.now();
    output = sortAndFilterMovies(await transform(input, sourcedEvents ?? {}));
    console.log(
      ` - ✅ Transformed (${Math.round((Date.now() - start) / 1000)}s)`,
    );
  } catch (e) {
    console.log(` - ❌ Error transforming`);
    throw e;
  }

  return output;
}

module.exports = transform;

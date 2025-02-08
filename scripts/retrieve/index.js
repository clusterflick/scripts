async function retrieve(location) {
  const { retrieve } = require(`../cinemas/${location}`);

  console.log(`[🎞️  Cinema: ${location}] Retrieving data ...`);

  let output;
  try {
    const start = Date.now();
    output = await retrieve();
    console.log(
      ` - ✅ Retrieved (${Math.round((Date.now() - start) / 1000)}s)`,
    );
  } catch (e) {
    console.log(` - ❌ Error retrieving`);
    throw e;
  }

  return output;
}

module.exports = retrieve;

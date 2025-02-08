async function retrieve(location) {
  const { retrieve } = require(`../../cinemas/${location}`);

  console.log(`[🎞️  Cinema: ${location}] Retrieving data ...`);

  let output;
  try {
    const start = Date.now();
    output = await retrieve();
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Retrieved (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error retrieving`);
    throw e;
  }

  return output;
}

module.exports = retrieve;

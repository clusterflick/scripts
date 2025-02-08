async function retrieve(location) {
  const { retrieve } = require(`../../cinemas/${location}`);

  console.log(`[🎞️  Cinema: ${location}]`);

  console.log("Retrieving data ...");
  let retrievedData;
  try {
    const start = Date.now();
    retrievedData = await retrieve();
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Retrieved (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error retrieving`);
    throw e;
  }

  return retrievedData;
}

module.exports = retrieve;

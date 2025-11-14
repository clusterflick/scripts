// Support retrieving both cinemas and sources
const getModule = (location) => {
  try {
    return require(`../../cinemas/${location}`);
  } catch {
    try {
      return require(`../../sources/${location}`);
    } catch {
      return {};
    }
  }
};

async function retrieve(location) {
  console.log(`[🎞️  Location: ${location}]`);

  const { retrieve } = getModule(location);
  if (!retrieve) throw new Error(`No module for location "${location}"`);

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

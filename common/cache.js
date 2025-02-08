const fs = require("node:fs");
const path = require("node:path");
const { format } = require("date-fns");

const cacheStats = {
  misses: [],
  hits: [],
};

function getCacheStats() {
  return cacheStats;
}

function clearCacheStats() {
  cacheStats.misses = [];
  cacheStats.hits = [];
}

function getCachePath(filename) {
  return path.join(process.cwd(), "cache", filename);
}

function getPathDaily(filename) {
  const suffix = format(new Date(), "yyyy-MM-dd");
  return getCachePath(`${filename}-${suffix}`);
}

const setupCacheDirectory = async () => {
  const directoryPath = getCachePath("");
  if (
    !fs.existsSync(directoryPath) ||
    !fs.statSync(directoryPath).isDirectory()
  ) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

function checkCache(filename, getPath) {
  return fs.existsSync(getPath(filename));
}

function readCache(filename, getPath) {
  setupCacheDirectory();
  const data = fs.readFileSync(getPath(filename), "utf8");
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function writeCache(filename, value, getPath) {
  setupCacheDirectory();
  let data;
  try {
    data = JSON.stringify(value, null, 2);
  } catch {
    data = value;
  }
  fs.writeFileSync(getPath(filename), data);
}

async function cache(key, retrieve, getPath = getCachePath) {
  let data;
  if (checkCache(key, getPath)) {
    data = readCache(key, getPath);
    cacheStats.hits.push(key);
  } else {
    data = await retrieve();
    writeCache(key, data, getPath);
    cacheStats.misses.push(key);
  }
  return data;
}

function dailyCache(key, retrieve) {
  return cache(key, retrieve, getPathDaily);
}

function readDailyCache(key) {
  if (checkCache(key, getPathDaily)) {
    return readCache(key, getPathDaily);
  }
}

module.exports = {
  clearCacheStats,
  getCacheStats,
  getCachePath,
  cache,
  dailyCache,
  readDailyCache,
  readCache,
};

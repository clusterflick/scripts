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

function getLlmCachePath(filename) {
  return path.join(process.cwd(), "cache-llm", filename);
}

function getPathDaily(filename, getPath = getCachePath) {
  if (!filename) return getPath("");
  const suffix = format(new Date(), "yyyy-MM-dd");
  return getPath(`${filename}-${suffix}`);
}

const setupCacheDirectory = async (getPath = getCachePath) => {
  const directoryPath = getPath("");
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
  setupCacheDirectory(getPath);
  const data = fs.readFileSync(getPath(filename), "utf8");
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function writeCache(filename, value, getPath) {
  setupCacheDirectory(getPath);
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

function dailyLlmCache(key, retrieve) {
  return cache(key, retrieve, (filename) =>
    getPathDaily(filename, getLlmCachePath),
  );
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
  dailyLlmCache,
  readDailyCache,
  readCache,
};

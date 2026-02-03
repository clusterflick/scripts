require("dotenv").config();
const { fetchJson, sleep } = require("../common/utils");
const distanceInKmBetweenCoordinates = require("../common/distance-in-km-between-coordinates");
const { dailyCache } = require("../common/cache");
const { getAllCinemaNames, getCinemaAttributes } = require("../cinemas");

const MAPS_API_KEY = process.env.MAPS_API_KEY;
const SIGNIFICANT_DISTANCE_KM = 0.025; // 25 meters

async function geocodeAddress(cinema, name, address) {
  const encodedAddress = encodeURIComponent(`${name}, ${address}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?key=${MAPS_API_KEY}&address=${encodedAddress}`;

  const cacheKey = `geocode-${cinema}`;
  const response = await dailyCache(cacheKey, async () => await fetchJson(url));
  return response.results[0].geometry.location;
}

async function checkCoordinates() {
  if (!MAPS_API_KEY) {
    console.error("❌ MAPS_API_KEY not found in .env file");
    process.exit(1);
  }

  const cinemas = getAllCinemaNames();

  console.log(`Checking coordinates for ${cinemas.length} cinemas...\n`);

  let failForError = false;

  for (const cinema of cinemas) {
    process.stdout.write(
      `[🎞️  Location: ${cinema}]${"".padEnd(Math.max(0, 70 - cinema.length), " ")}`,
    );

    const { name, address, geo } = getCinemaAttributes(cinema);
    // Rate limit: Google allows 50 requests per second, but let's be conservative
    await sleep(100);

    const geocodedLocation = await geocodeAddress(cinema, name, address);
    const distance = distanceInKmBetweenCoordinates(geo, {
      lat: geocodedLocation.lat,
      lon: geocodedLocation.lng,
    });

    if (distance > SIGNIFICANT_DISTANCE_KM) {
      const distanceInMeters = Math.round(distance * 1000);
      console.log(` - ❌ Difference: ${distanceInMeters}m`);
      failForError = true;
    } else {
      const distanceInMeters = Math.round(distance * 1000);
      console.log(` - ✅ Match (${distanceInMeters}m)`);
    }
  }

  if (failForError) {
    process.exit(1);
  }
}

checkCoordinates();

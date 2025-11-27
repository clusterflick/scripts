const discoverVenues = require("../sources/designmynight.com/discover-venues");

async function main() {
  const venues = await discoverVenues();

  // Don't filter by inLondon since some venues lack coordinates
  // (DesignMyNight API already filters to London region)
  venues.forEach((venue) => {
    const hasMatch = venue.matchingCinema ? "✅" : "❌";
    const matchInfo = venue.matchingCinema
      ? `(${venue.matchingCinema.id})`
      : "";
    const locationInfo = venue.coordinates ? "" : "(No coordinates)";

    const eventUrl = venue.events[0]?.path;

    console.log(
      `${hasMatch} ${venue.name} [${venue.events.length} events] ${locationInfo}${matchInfo}\n   ${eventUrl}`,
    );
  });

  console.log(`\nTotal: ${venues.length} venues`);
}

main().catch(console.error);

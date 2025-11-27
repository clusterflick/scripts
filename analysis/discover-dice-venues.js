const discoverVenues = require("../sources/dice.fm/discover-venues");

async function main() {
  const venues = await discoverVenues();

  const londonVenues = venues.filter((v) => v.inLondon);

  londonVenues.forEach((venue) => {
    const hasMatch = venue.matchingCinema ? "✅" : "❌";
    const matchInfo = venue.matchingCinema
      ? `(${venue.matchingCinema.id})`
      : "";

    const eventUrl = venue.events[0]?.url || "";

    console.log(
      `${hasMatch} ${venue.name} [${venue.events.length} events] ${matchInfo}\n   ${eventUrl}`,
    );
  });

  console.log(`\nTotal: ${londonVenues.length} venues in London`);
}

main().catch(console.error);

const { getSourceDiscoverVenues, getSourceAttributes } = require("../sources");

const discoverVenues = getSourceDiscoverVenues("ticketsource.co.uk");
const attributes = getSourceAttributes("ticketsource.co.uk");

async function main() {
  const venues = await discoverVenues();

  const londonVenues = venues.filter((v) => v.inLondon);

  londonVenues.forEach((venue) => {
    const hasMatch = venue.matchingCinema ? "✅" : "❌";
    const matchInfo = venue.matchingCinema
      ? `(${venue.matchingCinema.id})`
      : "";

    // Construct URL from first event's data
    const firstEvent = venue.events[0];
    const eventUrl = firstEvent
      ? `${attributes.domain}/whats-on/${firstEvent.locationSlug}/${firstEvent.venueSlug}/${firstEvent.eventSlug}/${firstEvent.eventHash}`
      : "";

    console.log(
      `${hasMatch} ${venue.name} [${venue.events.length} events] ${matchInfo}\n   ${eventUrl}`,
    );
  });

  console.log(`\nTotal: ${londonVenues.length} venues in London`);
}

main().catch(console.error);

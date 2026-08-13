const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");
const { extractEventLinks } = require("./utils");

// Each venue/organization has its own Ticket Tailor page - add new slugs here
const VENUE_SLUGS = [
  "weflockcic", // Good Shepherd Studios
  "maghrebcine", // Maghreb Ciné film club
  "offbeatfolkfilm", // Offbeat Folk Film
  "sickgirlfilms", // Sick Girl Films
  "filmlondon", // Film London
  "sirenscreen", // Siren Screen
  "eastlondonexperimentalfilmclub", // East London Experimental Film Club
  "wimbledonfilmclub", // Wimbledon Film Club
  "yourcinema", // Your Cinema
  "lost", // Lost Cinema
  "bellbottomsproductions", // Bellbottoms Productions
  "vauxhallone", // Vauxhall
  "midweekcinema", // Midweek Cinema(prev Debut Nights)
  "colfilmslimited", // The London Colombian Film Festival
  "csc2", // CSC
  "na258", // People's Emergency Briefing
  "ibraaz", // Ibraaz
];

function retrieveVenuePage(getPage, slug) {
  const url = `https://www.tickettailor.com/events/${slug}`;
  const cacheKey = `tickettailor-${slug}`;

  return getPage(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page
      .locator(".main-events-listing__events")
      .waitFor({ strict: false });
    return await page.content();
  });
}

function retrieveEventPage(getPage, { eventId, url }) {
  const cacheKey = `tickettailor-event-${eventId}`;

  return getPage(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    // Wait on the detail wrapper rather than the description itself - a
    // promoter who left the description blank still renders the wrapper.
    await page.locator(".detail-content").waitFor({ strict: false });
    return await page.content();
  });
}

async function retrieve() {
  // Share one browser across the club listings and every event page - the
  // listings sit behind the same Cloudflare check as the event pages, so
  // carrying the session's cookies through saves re-clearing it each time.
  return withPlaywrightSession(async (getPage) => {
    const clubPages = {};
    for (const slug of VENUE_SLUGS) {
      clubPages[slug] = await retrieveVenuePage(getPage, slug);
    }

    // The listing pages carry only title, date and location - the promoter's
    // description (who is putting the screening on, which films are showing)
    // lives on the event page, so pull that in too.
    const eventLinks = new Map();
    for (const html of Object.values(clubPages)) {
      for (const link of extractEventLinks(html)) {
        // Clubs co-promoting a screening list the same event, so key on the
        // event id to fetch each page once.
        if (!eventLinks.has(link.eventId)) eventLinks.set(link.eventId, link);
      }
    }
    console.log(`    - Found ${eventLinks.size} event pages to retrieve`);

    const eventPages = {};
    for (const link of eventLinks.values()) {
      eventPages[link.eventId] = await retrieveEventPage(getPage, link);
    }

    return { clubPages, eventPages };
  });
}

module.exports = retrieve;

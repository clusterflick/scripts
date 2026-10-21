const { removeAlreadyListedPerformances } = require("../utils");

describe("removeAlreadyListedPerformances", () => {
  const venueDomain = "https://www.coldharbourblue.com";
  const time = 1786644000000;
  const venueMovie = (bookingUrl, overrides = {}) => ({
    title: "Point Break",
    performances: [{ time, bookingUrl, ...overrides }],
  });
  const sourcedEvent = (bookingUrl, overrides = {}) => ({
    title: "Point Break",
    performances: [{ time, bookingUrl, ...overrides }],
  });

  test("removes a sourced performance the venue already books through", () => {
    const url = "https://www.thecliq.app/event/cinebug-summer-social";
    expect(
      removeAlreadyListedPerformances([venueMovie(url)], [sourcedEvent(url)], {
        venueDomain,
      }),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  test("keeps a sourced performance booked elsewhere", () => {
    const sourced = sourcedEvent("https://www.thecliq.app/event/other-night", {
      time: time + 3600000,
    });
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://www.thecliq.app/event/cinebug-summer-social")],
        [sourced],
        { venueDomain },
      ),
    ).toEqual([sourced]);
  });

  test("keeps a sourced performance when neither side has a booking URL", () => {
    const sourced = sourcedEvent("");
    expect(
      removeAlreadyListedPerformances([venueMovie("")], [sourced], {
        venueDomain,
      }),
    ).toEqual([sourced]);
  });

  // The Phoenix links japanesefilm.club's film page while japanesefilm.club
  // links its own per-performance page - the same screening, spelled two ways.
  test("removes a sourced performance booked through the same organiser at the same time", () => {
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://japanesefilm.club/shall-we-dance/")],
        [
          sourcedEvent(
            "https://japanesefilm.club/shall-we-dance-4k-restoration-phoenix-cinema-east-finchley-2026-09-12-1700/",
          ),
        ],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  test("matches an organiser host regardless of a www prefix", () => {
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://www.japanesefilm.club/shall-we-dance/")],
        [sourcedEvent("https://japanesefilm.club/shall-we-dance-phoenix/")],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  test("keeps a sourced performance booked through a different organiser", () => {
    const sourced = sourcedEvent("https://www.thecliq.app/event/other-night");
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://japanesefilm.club/shall-we-dance/")],
        [sourced],
        { venueDomain },
      ),
    ).toEqual([sourced]);
  });

  // Two screens can open at the same time on the venue's own ticketing, so a
  // booking there says nothing about who is running the night.
  test("keeps a sourced performance sharing a time with a booking on the venue's own domain", () => {
    const sourced = sourcedEvent(
      "https://www.coldharbourblue.com/events/other-night",
    );
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://www.coldharbourblue.com/events/cinebug-social")],
        [sourced],
        { venueDomain },
      ),
    ).toEqual([sourced]);
  });

  // The Cinema Museum links its Eventbrite listing on the .co.uk domain while
  // the Eventbrite source reaches the same event on .com.
  test("matches an Eventbrite event across its country domains", () => {
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://www.eventbrite.co.uk/e/1991055325075")],
        [
          sourcedEvent(
            "https://www.eventbrite.com/checkout-external?eid=1991055325075",
          ),
        ],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  // gel.now lists the Cinema Museum's ticketlab link with a trailing "#/".
  // Its time is the doors (19:30 for a 20:30 start), so only the link can
  // tell it's the same screening.
  test("matches a booking URL regardless of an empty fragment", () => {
    const url =
      "https://ticketlab.app/event/39463-Dog-Star-Man-1964-on-16mm-tickets";
    expect(
      removeAlreadyListedPerformances(
        [venueMovie(url)],
        [sourcedEvent(`${url}#/`, { time: time - 3600000 })],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  // gel.now links the Cinema Museum's own page for Dyn Amo, while the museum's
  // listing books through ticketlab.
  test("removes a sourced performance linking the venue's page for the same screening", () => {
    const page = "https://cinemamuseum.org.uk/scheduled/dyn-amo-1973-on-16mm/";
    expect(
      removeAlreadyListedPerformances(
        [
          {
            ...venueMovie("https://ticketlab.app/event/39823-Dyn-Amo-tickets"),
            url: page,
          },
        ],
        [sourcedEvent(page)],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  // A venue's page can be shared by every date of a run, so the page alone
  // doesn't say which screening was meant.
  test("keeps a sourced performance linking the venue's page at another time", () => {
    const page = "https://cinemamuseum.org.uk/scheduled/dyn-amo-1973-on-16mm/";
    const sourced = sourcedEvent(page, { time: time + 3600000 });
    expect(
      removeAlreadyListedPerformances(
        [
          {
            ...venueMovie("https://ticketlab.app/event/39823-Dyn-Amo-tickets"),
            url: page,
          },
        ],
        [sourced],
        { venueDomain },
      ),
    ).toEqual([sourced]);
  });

  test("throws when no venue domain is given", () => {
    expect(() =>
      removeAlreadyListedPerformances(
        [venueMovie("https://japanesefilm.club/shall-we-dance/")],
        [sourcedEvent("https://japanesefilm.club/shall-we-dance-phoenix/")],
      ),
    ).toThrow("venueDomain must be an absolute URL");
  });
});

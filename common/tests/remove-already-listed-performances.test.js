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

  // gel.now gives doors opening as the start (19:30 for a 20:30 screening), so
  // only the link can match these, and one side ends in an empty "#/".
  test("matches a booking link that differs only by an empty fragment", () => {
    const ticketlab =
      "https://ticketlab.app/event/39463-Dog-Star-Man-1964-on-16mm-tickets";
    expect(
      removeAlreadyListedPerformances(
        [venueMovie(ticketlab)],
        [sourcedEvent(`${ticketlab}#/`, { time: time - 3600000 })],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
    expect(
      removeAlreadyListedPerformances(
        [venueMovie(`${ticketlab}#/`)],
        [sourcedEvent(`${ticketlab}#`, { time: time - 3600000 })],
        { venueDomain },
      ),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  test("keeps booking links whose fragments name different events", () => {
    const sourced = sourcedEvent("https://tickets.example.com/#/event/2", {
      time: time + 3600000,
    });
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://tickets.example.com/#/event/1")],
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

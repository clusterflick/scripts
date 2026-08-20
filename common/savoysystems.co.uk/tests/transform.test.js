const transform = require("../transform");

const attributes = {
  id: "thelexicinema.co.uk",
  name: "The Lexi Cinema",
  domain: "https://thelexicinema.co.uk",
};

const VENUE_BOOKING_URL =
  "https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn?f=10072764";

const CLUB_BOOKING_URL =
  "https://japanesefilm.club/kamikaze-girls-the-lexi-cinema-kensal-rise-2026-09-19-1800/";

// A trimmed `Events` entry with the fields transform reads. The Lexi hands
// booking for club screenings over to the organiser, so `Performances[].URL` is
// an absolute URL off-site rather than a relative Savoy booking path.
const venueEvent = (bookingUrl) => ({
  ID: "10072764",
  Title: "Japanese Film Club: Kamikaze Girls",
  URL: VENUE_BOOKING_URL,
  Synopsis: "Momoko dreams of Versailles.",
  RunningTime: 102,
  Rating: "bbfc/lrg/15.png",
  Director: "Tetsuya Nakashima",
  Cast: "Kyoko Fukada",
  Performances: [
    { StartDate: "2026-09-19", StartTimeAndNotes: "18:00", URL: bookingUrl },
  ],
});

const sourcedEvent = (bookingUrl) => ({
  showingId: "japanesefilm.club-kamikaze-girls",
  title: "Kamikaze Girls",
  url: "https://japanesefilm.club/kamikaze-girls/",
  overview: { categories: [], directors: [], actors: [] },
  performances: [
    {
      time: new Date("2026-09-19T17:00:00Z").getTime(),
      notes: "Presented by Japanese Film Club",
      bookingUrl,
      status: {},
      accessibility: {},
      format: {},
    },
  ],
});

const runTransform = (venueBookingUrl, sourced) =>
  transform(
    attributes,
    "TheLexiCinema.dll",
    {
      movieListPage: { Events: [venueEvent(venueBookingUrl)] },
      moviePages: {},
    },
    { "japanesefilm.club": sourced },
  );

describe("Savoy Systems transform", () => {
  it("drops a sourced performance the venue already sends to the same booking url", async () => {
    const movies = await runTransform(CLUB_BOOKING_URL, [
      sourcedEvent(CLUB_BOOKING_URL),
    ]);

    expect(movies).toHaveLength(2);
    expect(movies[0].showingId).toEqual("thelexicinema.co.uk-10072764");
    expect(movies[0].performances).toHaveLength(1);
    expect(movies[0].performances[0].time).toEqual(
      new Date("2026-09-19T18:00:00+01:00").getTime(),
    );
    // Emptied rather than removed — sortAndFilterMovies drops it downstream.
    expect(movies[1].showingId).toEqual("japanesefilm.club-kamikaze-girls");
    expect(movies[1].performances).toEqual([]);
  });

  // The two sides rarely publish the same link: the Phoenix sends bookings to
  // the organiser's film page while the organiser links its own per-performance
  // page, and the Rio sends them to an organiser seat-select URL.
  it.each([
    ["a film page", "https://japanesefilm.club/kamikaze-girls/"],
    [
      "a seat-select url",
      "https://japanesefilm.club/seat-select/?scr_film=5831&scr_id=6a4bb4e4461de",
    ],
  ])(
    "drops a sourced performance the venue sends to the same organiser via %s",
    async (_, venueBookingUrl) => {
      const movies = await runTransform(venueBookingUrl, [
        sourcedEvent(CLUB_BOOKING_URL),
      ]);

      expect(movies).toHaveLength(2);
      expect(movies[0].performances).toHaveLength(1);
      expect(movies[1].performances).toEqual([]);
    },
  );

  it("keeps a sourced performance the venue books elsewhere", async () => {
    const movies = await runTransform(VENUE_BOOKING_URL, [
      sourcedEvent(CLUB_BOOKING_URL),
    ]);

    expect(movies).toHaveLength(2);
    expect(movies[0].performances).toHaveLength(1);
    expect(movies[0].performances[0].bookingUrl).toEqual(VENUE_BOOKING_URL);
    expect(movies[1].performances).toHaveLength(1);
    expect(movies[1].performances[0].bookingUrl).toEqual(CLUB_BOOKING_URL);
  });

  // A venue can open two screens at the same minute, so its own ticketing
  // domain says nothing about which screening a sourced event is. Only an
  // identical url drops one of those.
  it("keeps a sourced performance sharing a time with a booking on the venue's own domain", async () => {
    const otherVenueBookingUrl =
      "https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn?f=10072999";
    const movies = await runTransform(VENUE_BOOKING_URL, [
      sourcedEvent(otherVenueBookingUrl),
    ]);

    expect(movies).toHaveLength(2);
    expect(movies[1].performances).toHaveLength(1);
    expect(movies[1].performances[0].bookingUrl).toEqual(otherVenueBookingUrl);
  });

  // gel.now relays the Rio's own listing, linking back to "?f=<film id>"
  // instead of publishing a page of its own. That id names the listing we
  // already read the film's performances from, so the relay adds nothing -
  // unlike the different film id above, which is a second screen.
  it("drops a sourced performance relaying the venue's own listing by film id", async () => {
    const movies = await runTransform(VENUE_BOOKING_URL, [
      sourcedEvent(VENUE_BOOKING_URL),
    ]);

    expect(movies).toHaveLength(2);
    expect(movies[0].performances).toHaveLength(1);
    expect(movies[1].performances).toEqual([]);
  });

  it("never treats a missing booking url as a match", async () => {
    const movies = await runTransform("", [sourcedEvent("")]);

    expect(movies).toHaveLength(2);
    expect(movies[0].performances).toHaveLength(1);
    expect(movies[0].performances[0].bookingUrl).toEqual(
      VENUE_BOOKING_URL.split("dll/")[0] + "dll/",
    );
    expect(movies[1].performances).toHaveLength(1);
    expect(movies[1].performances[0].bookingUrl).toEqual("");
  });

  it("leaves a venue with no sourced events untouched", async () => {
    const movies = await runTransform(CLUB_BOOKING_URL, []);

    expect(movies).toHaveLength(1);
    expect(movies[0].performances).toHaveLength(1);
    expect(movies[0].performances[0].bookingUrl).toEqual(CLUB_BOOKING_URL);
  });

  // Rio Cinema's "Category H" double-bill listings join each film's Director
  // and Cast with " + " rather than sending them as two separate films.
  it("splits a double bill's '+'-joined Director and Cast into separate names", async () => {
    const doubleBillEvent = {
      ...venueEvent(VENUE_BOOKING_URL),
      Title: "Category H: SEYTAN + THE FLY",
      Director: "Metin Erksan + David Cronenberg",
      Cast: "Cihan Ünal + Jeff Goldblum",
    };
    const movies = await transform(
      attributes,
      "TheLexiCinema.dll",
      { movieListPage: { Events: [doubleBillEvent] }, moviePages: {} },
      {},
    );

    expect(movies[0].overview.directors).toEqual([
      "Metin Erksan",
      "David Cronenberg",
    ]);
    expect(movies[0].overview.actors).toEqual(["Cihan Ünal", "Jeff Goldblum"]);
  });
});

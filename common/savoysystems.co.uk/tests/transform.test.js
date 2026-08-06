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
});

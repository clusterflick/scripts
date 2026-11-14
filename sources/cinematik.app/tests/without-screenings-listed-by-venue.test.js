const withoutScreeningsListedByVenue = require("../without-screenings-listed-by-venue");

const LUMIERE = "https://www.lumiereromford.com";

const at = (dateTime) => new Date(dateTime).getTime();

// How find-events shapes a screening Cinematik only links out to: booked at the
// film's showtimes for the day on the venue's own site
const cinematikEvent = (film, times) => ({
  showingId: `cinematik.app-${film}`,
  performances: times.map((time) => ({
    time: at(time),
    bookingUrl: `${LUMIERE}/movies/${film}/showtimes/${time.slice(0, 10)}?location=romford`,
  })),
});

// How the venue's own listing links the same screening: its seat plan
const venueMovie = (
  film,
  time,
  showtime = "K1N0MEloWFZjYlI3NDE2UWgwcFFDZz09",
) => ({
  performances: [
    {
      time: at(time),
      bookingUrl: `${LUMIERE}/movies/${film}/showtimes/${time.slice(0, 10)}/romford/seat-plan?showtime=${showtime}`,
    },
  ],
});

const cinematikScreenings = (sourcedEvents) =>
  sourcedEvents["cinematik.app"].map(({ performances }) =>
    performances.map(({ time }) => new Date(time).toISOString()),
  );

describe("withoutScreeningsListedByVenue", () => {
  it("drops a screening the venue lists at the same film, day and time", () => {
    const movies = [venueMovie("marie-antoinette", "2026-11-24T10:00:00Z")];
    const sourcedEvents = {
      "cinematik.app": [
        cinematikEvent("marie-antoinette", ["2026-11-24T10:00:00Z"]),
      ],
    };

    expect(withoutScreeningsListedByVenue(movies, sourcedEvents)).toStrictEqual(
      { "cinematik.app": [] },
    );
  });

  it("keeps a screening the venue lists at another time that day", () => {
    const movies = [venueMovie("marie-antoinette", "2026-11-24T17:00:00Z")];
    const sourcedEvents = {
      "cinematik.app": [
        cinematikEvent("marie-antoinette", ["2026-11-24T10:00:00Z"]),
      ],
    };

    expect(
      cinematikScreenings(
        withoutScreeningsListedByVenue(movies, sourcedEvents),
      ),
    ).toStrictEqual([["2026-11-24T10:00:00.000Z"]]);
  });

  it("keeps a screening when another film starts at the same time", () => {
    // The Lumiere starts Ebenezer and The Nice Ones alongside Marie Antoinette
    const movies = [venueMovie("ebenezer-2026", "2026-11-24T10:00:00Z")];
    const sourcedEvents = {
      "cinematik.app": [
        cinematikEvent("marie-antoinette", ["2026-11-24T10:00:00Z"]),
      ],
    };

    expect(
      cinematikScreenings(
        withoutScreeningsListedByVenue(movies, sourcedEvents),
      ),
    ).toStrictEqual([["2026-11-24T10:00:00.000Z"]]);
  });

  it("drops only the screenings the venue lists, keeping the rest", () => {
    const movies = [venueMovie("marie-antoinette", "2026-11-22T16:15:00Z")];
    const sourcedEvents = {
      "cinematik.app": [
        cinematikEvent("marie-antoinette", [
          "2026-11-22T16:15:00Z",
          "2026-11-25T17:00:00Z",
        ]),
      ],
    };

    expect(
      cinematikScreenings(
        withoutScreeningsListedByVenue(movies, sourcedEvents),
      ),
    ).toStrictEqual([["2026-11-25T17:00:00.000Z"]]);
  });

  it("leaves other sources' screenings alone", () => {
    const movies = [venueMovie("marie-antoinette", "2026-11-24T10:00:00Z")];
    const otherSource = [
      cinematikEvent("marie-antoinette", ["2026-11-24T10:00:00Z"]),
    ];
    const sourcedEvents = { "eventbrite.co.uk": otherSource };

    expect(withoutScreeningsListedByVenue(movies, sourcedEvents)).toStrictEqual(
      { "eventbrite.co.uk": otherSource },
    );
  });
});

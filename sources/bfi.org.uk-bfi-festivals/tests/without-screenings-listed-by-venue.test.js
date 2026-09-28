const withoutScreeningsListedByVenue = require("../without-screenings-listed-by-venue");

const LFF = "https://whatson.bfi.org.uk/lff/Online/";
const ARTICLE_ID = "1180DCE7-A5D5-415E-9CD6-1A4810A608C6";

const at = (dateTime) => new Date(dateTime).getTime();

// How find-events shapes a festival film: the permalink in its url, the article
// id in each performance's booking link
const festivalEvent = (permalink, articleId, times) => ({
  showingId: `bfi.org.uk-bfi-festivals-${permalink}`,
  url: `${LFF}default.asp?BOparam::WScontent::loadArticle::permalink=${permalink}`,
  performances: times.map((time) => ({
    time: at(time),
    bookingUrl: `${LFF}default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${articleId}&BOparam::WScontent::loadArticle::context_id=6C772DDB-AD28-4536-B639-C8449FCC318F`,
  })),
});

const venueMovie = (bookingUrl, time) => ({
  url: "https://venue.example/films/act-3",
  performances: [{ time: at(time), bookingUrl }],
});

const festivalScreenings = (sourcedEvents) =>
  sourcedEvents["bfi.org.uk-bfi-festivals"].map(({ performances }) =>
    performances.map(({ time }) => new Date(time).toISOString()),
  );

describe("withoutScreeningsListedByVenue", () => {
  it("drops a screening the venue links to by the film's permalink", () => {
    const movies = [
      venueMovie(`${LFF}article/act-3-lff26`, "2026-10-17T20:40:00+01:00"),
    ];
    const sourcedEvents = {
      "bfi.org.uk-bfi-festivals": [
        festivalEvent("act-3-lff26", ARTICLE_ID, ["2026-10-17T20:40:00+01:00"]),
      ],
    };

    expect(withoutScreeningsListedByVenue(movies, sourcedEvents)).toStrictEqual(
      { "bfi.org.uk-bfi-festivals": [] },
    );
  });

  it("drops a screening the venue links to by article id, at its own time", () => {
    // The Prince Charles listed this 15 minutes before the festival does
    const movies = [
      venueMovie(
        `${LFF}default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${ARTICLE_ID.toLowerCase()}`,
        "2026-10-07T18:15:00+01:00",
      ),
    ];
    const sourcedEvents = {
      "bfi.org.uk-bfi-festivals": [
        festivalEvent("cameron-winter-lff26", ARTICLE_ID, [
          "2026-10-07T18:30:00+01:00",
        ]),
      ],
    };

    expect(
      festivalScreenings(withoutScreeningsListedByVenue(movies, sourcedEvents)),
    ).toStrictEqual([]);
  });

  it("reads a link published with the venue's domain in front of it", () => {
    const movies = [
      venueMovie(
        `https://www.ica.art%20${LFF}article/act-3-lff26`,
        "2026-10-17T20:40:00+01:00",
      ),
    ];
    const sourcedEvents = {
      "bfi.org.uk-bfi-festivals": [
        festivalEvent("act-3-lff26", ARTICLE_ID, ["2026-10-17T20:40:00+01:00"]),
      ],
    };

    expect(
      festivalScreenings(withoutScreeningsListedByVenue(movies, sourcedEvents)),
    ).toStrictEqual([]);
  });

  it("keeps a screening of the same film the venue doesn't list", () => {
    const movies = [
      venueMovie(`${LFF}article/act-3-lff26`, "2026-10-17T20:40:00+01:00"),
    ];
    const sourcedEvents = {
      "bfi.org.uk-bfi-festivals": [
        festivalEvent("act-3-lff26", ARTICLE_ID, [
          "2026-10-17T20:40:00+01:00",
          "2026-10-18T13:00:00+01:00",
        ]),
      ],
    };

    expect(
      festivalScreenings(withoutScreeningsListedByVenue(movies, sourcedEvents)),
    ).toStrictEqual([["2026-10-18T12:00:00.000Z"]]);
  });

  it("keeps a film the venue doesn't link to, whatever the time", () => {
    const movies = [
      venueMovie(`${LFF}article/act-3-lff26`, "2026-10-17T20:40:00+01:00"),
    ];
    const sourcedEvents = {
      "bfi.org.uk-bfi-festivals": [
        festivalEvent("solwata-lff26", "0B78BEDB-D17D-4172-ABA3-2C86BD8A0E0C", [
          "2026-10-17T20:40:00+01:00",
        ]),
      ],
    };

    expect(
      festivalScreenings(withoutScreeningsListedByVenue(movies, sourcedEvents)),
    ).toStrictEqual([["2026-10-17T19:40:00.000Z"]]);
  });

  it("leaves other sources' events alone", () => {
    const eventbrite = [{ showingId: "eventbrite-1", performances: [] }];

    expect(
      withoutScreeningsListedByVenue([], {
        "eventbrite.co.uk": eventbrite,
      }),
    ).toStrictEqual({ "eventbrite.co.uk": eventbrite });
  });
});

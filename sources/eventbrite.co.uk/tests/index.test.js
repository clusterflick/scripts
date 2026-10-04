/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
  schemaValidate,
  silenceConsoleLog,
} = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// The date the cache files in __manual-recordings__ were written, which is the
// suffix every one of their filenames carries. Change it when the fixtures are
// replaced, and pin the clock to the same day so the run reads as it did then.
const CACHE_DATE = "2026-09-12";

// A whole retrieve is the two search sweeps, a calendar for every organiser at
// a venue we hold, and an event page each - the better part of a thousand
// requests. They replay from the cache files a real run wrote rather than from
// HTTP recordings of every one of them, which is also what keeps retrieve's
// pacing out of the test: sleep() sits inside the dailyCache callback, and a
// cache hit never calls it. Polly stays for the request that escapes anyway -
// a missing fixture should fail here, not quietly reach Eventbrite.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, CACHE_DATE);

// Stubbed out: an id added to the seed list later would ask for a calendar
// these fixtures never captured. Seeding is organizer-sweep.test.js's business.
jest.mock("../seeded-organizers", () => []);

// The fixtures predate series expansion, so they hold no series' sessions -
// and can't be given any: the endpoint answers with the sessions still to come
// on the day it is asked, so a capture taken now is not what it said on the
// fixtures' date. Each series answers with none here instead. None sits at a
// venue asserted on below, and series-sessions.test.js and
// series-expansion.test.js cover the fetch and what is published from it.
jest.mock("../series-sessions", () => ({
  ...jest.requireActual("../series-sessions"),
  fetchSeriesSessions: async () => [],
}));

// Held to the venues we had when the fixtures were taken, for the same reason:
// a venue added since turns events the search captured into ones at a venue we
// hold, and retrieve then asks for their organiser's calendar and event pages,
// which were never written. Add a venue here when its events are in the
// fixtures, and empty the list when they are replaced.
const mockVenuesAddedSinceFixtures = [
  "lfs.org.uk",
  "propositionstudios.com",
  "centralfilmschool.com",
  "houseofannetta.org",
  "arts.ac.uk-london-college-of-communication",
  "ials.sas.ac.uk",
  "moyletts.co.uk",
  "nationaltrust.org.uk-osterley-park-and-house",
  "naturalphilosopher.co.uk",
  "nellofolddrury.co.uk",
  "southwark.gov.uk-canada-water-library",
  "ucl.ac.uk-garwood-lecture-theatre",
  "visitgunnersbury.org",
  "armenianinstitute.org.uk",
  "arts.ac.uk-central-saint-martins",
  "camden.gov.uk-swiss-cottage-library",
  "collage-arts.org-karamel-n22",
  "enfield.gov.uk-enfield-town-library",
  "haringey.gov.uk-wood-green-library",
  "lambeth.gov.uk-minet-library",
  "soas.ac.uk",
];
// A name added to a venue we already held does the same thing to the events
// listed under it, so those names are held back too - by venue, as the venue
// itself stays. Empty this alongside the list above.
const mockAlternativeNamesAddedSinceFixtures = {
  "arthub.org.uk": ["Art Hub Studios CIC"],
  "kilntheatre.com": ["Kiln Cinema"],
  "myvue.com-leicester-square": ["Vue Leicester Square"],
  "otterchaos.co.uk": ["Otter Chaos Brixton"],
  "oxfordhouse.org.uk": ["Oxford House in Bethnal Green"],
  "rca.ac.uk-battersea": ["Gorvy Lecture Theatre"],
  "regentstreetcinema.com": [
    "University of Westminster - Regent Street",
    "UG05 - University of Westminster",
  ],
};
jest.mock("../../../cinemas", () => {
  const cinemas = jest.requireActual("../../../cinemas");
  const withoutNamesAddedSinceFixtures = (cinema) => {
    const addedNames = mockAlternativeNamesAddedSinceFixtures[cinema.id];
    if (!addedNames) return cinema;
    return {
      ...cinema,
      alternativeNames: cinema.alternativeNames.filter(
        (name) => !addedNames.includes(name),
      ),
    };
  };
  return {
    ...cinemas,
    getAllCinemaAttributes: () =>
      cinemas
        .getAllCinemaAttributes()
        .filter(({ id }) => !mockVenuesAddedSinceFixtures.includes(id))
        .map(withoutNamesAddedSinceFixtures),
  };
});

silenceConsoleLog();

const cinema = {
  name: "Genesis Cinema",
  geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
};

// Every Genesis showing above is on sale, so availability needs a venue where
// it isn't. St Lawrence Jewry's two screenings had both sold out when the
// fixtures were taken, which is what makes it the one worth asserting on.
const soldOutCinema = {
  name: "St Lawrence Jewry",
  alternativeNames: [
    "St. Lawrence Jewry next Guildhall",
    "The Guild Church of St Lawrence Jewry",
  ],
  geo: { lat: 51.515374328307246, lon: -0.09249330021593258 },
};

const closeUpCinema = {
  name: "Close-Up Film Centre",
  alternativeNames: ["Close-Up Cinema"],
  geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
};

const uclEastCinema = {
  name: "UCL East Community Cinema",
  alternativeNames: [
    "UCL East Cinema",
    "UCL East - Marshgate",
    "UCL East - One Pool Street",
    "UCL Community Cinema",
  ],
  geo: { lat: 51.53829498102827, lon: -0.009739721124983678 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date(CACHE_DATE));

  it("retrieve and find events", async () => {
    const { movieListPages, moviePages, organizerEvents, seriesEvents } =
      await retrieve();

    // Make sure the input looks roughly correct
    expect(movieListPages).toBeTruthy();
    expect(movieListPages).toHaveLength(86);
    expect(moviePages).toBeTruthy();
    expect(Object.keys(moviePages)).toHaveLength(398);
    // The events the capped search never reached, recovered from the
    // organisers it did surface at venues we hold.
    expect(organizerEvents).toHaveLength(81);

    readJSON.mockImplementation(() => ({
      movieListPages,
      moviePages,
      organizerEvents,
      seriesEvents,
    }));

    const output = await findEvents(cinema);
    expect(
      output.every((movie) =>
        Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
      ),
    ).toBe(true);

    const data = JSON.parse(JSON.stringify(output))
      .map(removeMatchingHints)
      .map(addTestCategory);

    // Make sure the data looks roughly correct
    expect(schemaValidate(data)).toBe(true);
    expect(data).toHaveLength(4);
    expect(data).toMatchSnapshot();
  }, 30_000); // over HTTP needed. // under full-suite parallelism, though far short of what replaying them // Reading ~900 cache files back is still more than the default 5s allows

  it("reads ticket availability off the event page", async () => {
    const { movieListPages, moviePages, organizerEvents, seriesEvents } =
      await retrieve();
    readJSON.mockImplementation(() => ({
      movieListPages,
      moviePages,
      organizerEvents,
      seriesEvents,
    }));

    const output = await findEvents(soldOutCinema);

    expect(output).toHaveLength(2);
    expect(
      output.flatMap(({ performances }) =>
        performances.map(({ status }) => status),
      ),
    ).toEqual([{ soldOut: true }, { soldOut: true }]);
  }, 30_000);

  // Window Seat Cinema Club hires Close-Up for the night; its screening there
  // is in the fixtures, recovered from the club's own calendar.
  it("notes who presents a film club's screening", async () => {
    const { movieListPages, moviePages, organizerEvents, seriesEvents } =
      await retrieve();
    readJSON.mockImplementation(() => ({
      movieListPages,
      moviePages,
      organizerEvents,
      seriesEvents,
    }));

    const output = await findEvents(closeUpCinema);
    const windowSeat = output.filter(({ url }) =>
      url.endsWith("-1998553349869"),
    );

    expect(windowSeat).toHaveLength(1);
    expect(windowSeat[0].performances.map(({ notes }) => notes)).toEqual([
      "Presented by Window Seat Cinema Club",
    ]);
  }, 30_000);

  // UCL East listed the New Nordic Voices Film Festival in a collection of
  // that name, which is the only place its event pages name the festival.
  it("notes the festival an event is collected under", async () => {
    const { movieListPages, moviePages, organizerEvents, seriesEvents } =
      await retrieve();
    readJSON.mockImplementation(() => ({
      movieListPages,
      moviePages,
      organizerEvents,
      seriesEvents,
    }));

    const output = await findEvents(uclEastCinema);
    const armand = output.filter(({ url }) => url.endsWith("-1995948509722"));

    expect(armand).toHaveLength(1);
    expect(armand[0].performances.map(({ notes }) => notes)).toEqual([
      "Part of New Nordic Voices Film Festival (Public Admission)",
    ]);
  }, 30_000);
});

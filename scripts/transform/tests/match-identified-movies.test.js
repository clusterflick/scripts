// The point of interest is what reaches the search, so the search itself is
// stubbed - matching against a live TheMovieDB is what the venue tests cover.
// Prefixed `mock` so jest's hoisting lets the factory below close over it.
const mockSearchForBestMatch = jest.fn();

jest.mock("../../../common/get-movie-data", () => ({
  searchForBestMatch: (...args) => mockSearchForBestMatch(...args),
}));

const matchIdentifiedMovies = require("../match-identified-movies");

describe("matchIdentifiedMovies", () => {
  // A shorts programme as the transform hands it over: the hints describe the
  // whole block, and the names in them were extracted from that blurb rather
  // than given as a director field.
  const programme = {
    title: "Shorts Block 8 - LIFF",
    performances: [{ time: new Date("2026-10-08T18:00:00Z").getTime() }],
    matchingHints: {
      overview: "Films featured:\nPoppy by Julia Schönstädt, 17 mins",
      crew: ["Someone Named In The Blurb"],
    },
  };

  const identifying = (...movies) => ({
    movies,
    reason: "test",
  });

  const found = (result) => {
    mockSearchForBestMatch.mockResolvedValue(result);
  };

  beforeEach(() => {
    mockSearchForBestMatch.mockReset();
    found(undefined);
  });

  const searchedWith = (call = 0) => mockSearchForBestMatch.mock.calls[call][0];

  it("gives the identified director to the search as overview crew", async () => {
    // Left only in the hints, this name is invisible to the single-result
    // branches of getBestMatch, which read the overview alone - so a short that
    // isn't on TheMovieDB gets matched to whatever film shares its title.
    await matchIdentifiedMovies(programme, async () =>
      identifying({
        title: "Poppy",
        director: "Julia Schönstädt",
        year: "2026",
        confidence: 9,
      }),
    );

    expect(searchedWith().movie.overview.directors).toEqual([
      "Julia Schönstädt",
    ]);
  });

  it("splits a director credit shared between two people", async () => {
    await matchIdentifiedMovies(programme, async () =>
      identifying({
        title: "Blood Runner",
        director: "Eda Sezer & Jonah Attalla",
        confidence: 9,
      }),
    );

    expect(searchedWith().movie.overview.directors).toEqual([
      "Eda Sezer",
      "Jonah Attalla",
    ]);
  });

  it("leaves the overview crew empty when no director was identified", async () => {
    // Nothing to gate on, so the search behaves as it did before: the blurb's
    // names stay available as the weaker hint they always were.
    await matchIdentifiedMovies(programme, async () =>
      identifying({ title: "Bleach", director: null, confidence: 9 }),
    );

    expect(searchedWith().movie.overview.directors).toEqual([]);
    expect(searchedWith().movie.matchingHints.crew).toEqual([
      "Someone Named In The Blurb",
    ]);
  });

  it("does not search for identifications below the confidence threshold", async () => {
    await matchIdentifiedMovies(programme, async () =>
      identifying(
        { title: "Unrest", director: "Jacob Vickers", confidence: 6 },
        { title: "Gobstopper", director: "Pippa Lore", confidence: 7 },
      ),
    );

    expect(mockSearchForBestMatch).toHaveBeenCalledTimes(1);
    expect(searchedWith().movie.title).toBe("Gobstopper");
  });

  it("returns nothing when the search rejects every identified film", async () => {
    const matches = await matchIdentifiedMovies(programme, async () =>
      identifying({
        title: "Poppy",
        director: "Julia Schönstädt",
        confidence: 9,
      }),
    );

    expect(matches).toEqual([]);
  });

  it("deduplicates films that resolve to the same entry", async () => {
    found({
      id: 1767636,
      title: "Blood Runner",
      release_date: "2026-10-08",
      overview: "A blood delivery mirrors her own trauma.",
    });

    const matches = await matchIdentifiedMovies(programme, async () =>
      identifying(
        { title: "Blood Runner", director: "Eda Sezer", confidence: 9 },
        { title: "Bloodrunner", director: "Eda Sezer", confidence: 9 },
      ),
    );

    expect(matches).toEqual([
      {
        id: 1767636,
        title: "Blood Runner",
        releaseDate: "2026-10-08",
        summary: "A blood delivery mirrors her own trauma.",
      },
    ]);
  });

  it("falls back to the first performance when the entry has no release date", async () => {
    found({ id: 1657176, title: "Unrest", overview: "" });

    const matches = await matchIdentifiedMovies(programme, async () =>
      identifying({
        title: "Unrest",
        director: "Jacob Vickers",
        confidence: 9,
      }),
    );

    expect(matches[0].releaseDate).toBe("2026-10-08");
  });
});

const { silenceConsoleLog } = require("../test-utils");

silenceConsoleLog();

// The lookups a title search makes, stubbed. Prefixed `mock` so jest's
// hoisting lets the factories below close over them.
const mockSearchPerson = jest.fn();
const mockSearchMovie = jest.fn();
const mockMovieInfo = jest.fn();
const mockReviewResults = jest.fn();

jest.mock("moviedb-promise", () => ({
  MovieDb: class {
    searchPerson(...args) {
      return mockSearchPerson(...args);
    }
    searchMovie(...args) {
      return mockSearchMovie(...args);
    }
    movieInfo(...args) {
      return mockMovieInfo(...args);
    }
  },
}));

// The cache writes to disk and keys on the day; nothing here is testing that,
// and a shared cache directory would carry answers between test cases.
jest.mock("../cache", () => ({
  dailyCache: (key, retrieve) => retrieve(),
}));

jest.mock("../review-results", () => mockReviewResults);

// Reached only once the reviewer has declined; no LLM is asked in these tests.
jest.mock("../ask-llm", () => async () => null);

const { searchForBestMatch } = require("../get-movie-data");

const result = (id, title, releaseDate) => ({
  id,
  title,
  original_title: title,
  release_date: releaseDate,
});

// The search for "The Metropolitan Opera: Manon": the 2019 production and its
// 2026/27 revival share a title, alongside two that don't.
const original = result(616147, "The Metropolitan Opera: Manon", "2019-10-26");
const revival = result(
  1703631,
  "The Metropolitan Opera 2026/27: Manon",
  "2027-04-03",
);
const searchResults = [
  original,
  result(458972, "Manon Lescaut - Metropolitan Opera", "2016-03-05"),
  result(267255, "Puccini: Manon Lescaut", "1980-03-29"),
  revival,
];

const directedBy = (name) => ({
  credits: { crew: [{ name, job: "Director" }], cast: [] },
});

// Phoenix Cinema's listing: no director field, but crew hints pulled from the
// synopsis, which names the production's director.
const listing = {
  normalizedTitle: "metropolitan opera manon",
  movie: {
    title: "Met Opera 2026-27: Manon",
    overview: { directors: [], actors: [] },
    matchingHints: {
      overview: "Nadine Sierra takes on the title role in Laurent Pelly's…",
      crew: ["Nadine Sierra", "Laurent Pelly"],
    },
  },
};

describe("choosing between same-titled results by crew", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchPerson.mockResolvedValue({ results: [] });
    mockSearchMovie.mockResolvedValue({
      results: searchResults,
      total_pages: 1,
    });
    mockReviewResults.mockResolvedValue(null);
  });

  it("takes the one result the crew picks out", async () => {
    mockMovieInfo.mockImplementation(async ({ id }) =>
      directedBy(id === revival.id ? "Laurent Pelly" : "Someone Else"),
    );

    const match = await searchForBestMatch(listing);

    expect(match).toBe(revival);
    expect(mockReviewResults).not.toHaveBeenCalled();
  });

  it("leaves it to the reviewer when the crew is true of several", async () => {
    // A revival credits the original's director, so both carry the name and
    // the first was being taken on TheMovieDB's search order alone.
    mockMovieInfo.mockResolvedValue(directedBy("Laurent Pelly"));
    mockReviewResults.mockResolvedValue(revival);

    const match = await searchForBestMatch(listing);

    expect(match).toBe(revival);
    expect(mockReviewResults).toHaveBeenCalledTimes(1);
  });
});

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

const directedBy = (name) => ({
  credits: { crew: [{ name, job: "Director" }], cast: [] },
});

// The only "Saddled" TheMovieDB has: Brian Kamerer's 2023 feature.
const kamerersSaddled = result(1701010, "Saddled", "2023-10-06");

// ArtHouse Crouch End's listing: no director field, but the synopsis names the
// short's director, and the transform passes that on as a crew hint.
const listing = (crew) => ({
  normalizedTitle: "saddled",
  movie: {
    title: "Saddled - Short Film - UK Première",
    overview: { directors: [], actors: [] },
    matchingHints: {
      overview:
        "You're invited to the première of Saddled, the first short film by Ruben Giovannoni, produced by Curious People UK and BrightVox Studios.",
      crew,
    },
  },
});

const searchReturns = (results) =>
  mockSearchMovie.mockResolvedValue({ results, total_pages: 1 });

describe("a search that leaves one candidate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchPerson.mockResolvedValue({ results: [] });
    mockReviewResults.mockResolvedValue(null);
    mockMovieInfo.mockResolvedValue(directedBy("Brian Kamerer"));
  });

  it("does not take it on its title when its credits name none of the hinted crew", async () => {
    searchReturns([kamerersSaddled]);

    const match = await searchForBestMatch(listing(["Ruben Giovannoni"]));

    expect(match).toBeNull();
    // Left to the reviewer, with the candidate still on offer
    expect(mockReviewResults).toHaveBeenCalledWith(
      expect.anything(),
      [kamerersSaddled],
      "saddled",
    );
  });

  it("lets the reviewer choose it", async () => {
    searchReturns([kamerersSaddled]);
    mockReviewResults.mockResolvedValue(kamerersSaddled);

    const match = await searchForBestMatch(listing(["Ruben Giovannoni"]));

    expect(match).toBe(kamerersSaddled);
  });

  it("takes it when the hinted crew is in its credits", async () => {
    searchReturns([kamerersSaddled]);

    const match = await searchForBestMatch(listing(["Brian Kamerer"]));

    expect(match).toBe(kamerersSaddled);
    expect(mockReviewResults).not.toHaveBeenCalled();
  });

  it("still takes it on its title when nothing names anyone", async () => {
    searchReturns([kamerersSaddled]);

    const match = await searchForBestMatch(listing([]));

    expect(match).toBe(kamerersSaddled);
    expect(mockReviewResults).not.toHaveBeenCalled();
  });

  it("checks the hinted crew when it is the only same-titled one of many", async () => {
    searchReturns([
      kamerersSaddled,
      result(1, "Saddled with Trouble", "1999-01-01"),
      result(2, "Unsaddled", "2001-01-01"),
      result(3, "Saddled Up", "2010-01-01"),
    ]);

    const match = await searchForBestMatch(listing(["Ruben Giovannoni"]));

    expect(match).toBeNull();
  });
});

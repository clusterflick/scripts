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

// Brian Kamerer's 2023 feature, the only "Saddled" TheMovieDB holds.
const feature = result(1701010, "Saddled", "2023-11-12");
const short = result(9999001, "Saddled", "2026-01-20");

const runtimes = { [feature.id]: 86, [short.id]: 12 };

// ArtHouse Crouch End's Eventbrite listing: no director, no cast, and a
// duration that is the event slot rather than the film.
const listing = (title) => ({
  normalizedTitle: "saddled",
  movie: {
    title,
    overview: { directors: [], actors: [], duration: 7200000 },
  },
});

describe("a listing billed as a short film", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchPerson.mockResolvedValue({ results: [] });
    mockMovieInfo.mockImplementation(async ({ id }) => ({
      runtime: runtimes[id],
      credits: { crew: [], cast: [] },
    }));
    mockReviewResults.mockResolvedValue(null);
  });

  it("is not matched to the one same-titled feature", async () => {
    mockSearchMovie.mockResolvedValue({ results: [feature], total_pages: 1 });

    const match = await searchForBestMatch(
      listing("Saddled - Short Film - UK Première"),
    );

    expect(match).toBeNull();
    expect(mockReviewResults).not.toHaveBeenCalled();
  });

  it("takes the short when the feature is ruled out beside it", async () => {
    mockSearchMovie.mockResolvedValue({
      results: [feature, short],
      total_pages: 1,
    });

    const match = await searchForBestMatch(
      listing("Saddled - Short Film - UK Première"),
    );

    expect(match).toBe(short);
  });

  it("keeps a candidate TheMovieDB gives no runtime for", async () => {
    mockSearchMovie.mockResolvedValue({ results: [feature], total_pages: 1 });
    mockMovieInfo.mockResolvedValue({ credits: { crew: [], cast: [] } });

    const match = await searchForBestMatch(
      listing("Saddled - Short Film - UK Première"),
    );

    expect(match).toBe(feature);
  });

  it("leaves a listing not billed as a short matched as before", async () => {
    mockSearchMovie.mockResolvedValue({ results: [feature], total_pages: 1 });

    const match = await searchForBestMatch(listing("Saddled"));

    expect(match).toBe(feature);
    expect(mockMovieInfo).not.toHaveBeenCalled();
  });
});

const { silenceConsoleLog } = require("../test-utils");

silenceConsoleLog();

// The lookups findMovieByDirector makes, stubbed. Prefixed `mock` so jest's
// hoisting lets the factories below close over them.
const mockSearchPerson = jest.fn();
const mockPersonMovieCredits = jest.fn();
const mockSearchMovie = jest.fn();

jest.mock("moviedb-promise", () => ({
  MovieDb: class {
    searchPerson(...args) {
      return mockSearchPerson(...args);
    }
    personMovieCredits(...args) {
      return mockPersonMovieCredits(...args);
    }
    searchMovie(...args) {
      return mockSearchMovie(...args);
    }
  },
}));

// The cache writes to disk and keys on the day; nothing here is testing that,
// and a shared cache directory would carry answers between test cases.
jest.mock("../cache", () => ({
  dailyCache: (key, retrieve) => retrieve(),
}));

const { searchForBestMatch } = require("../get-movie-data");

const httpError = (status) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, headers: {} },
  });

// Two people share the searched name, both filed under Directing, so both are
// candidates and the order between them is the ranking's own.
const twoPeopleNamed = (name) => ({
  results: [
    { id: 4479655, name, known_for_department: "Directing", popularity: 2 },
    { id: 12345, name, known_for_department: "Directing", popularity: 1 },
  ],
});

const directedFilm = (id, title) => ({
  crew: [{ id, title, job: "Director" }],
});

const listing = (title, director) => ({
  normalizedTitle: title,
  movie: {
    title,
    overview: { directors: [director], actors: [] },
  },
  year: "2026",
});

describe("matching a movie by its director", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchMovie.mockResolvedValue({ results: [], total_pages: 1 });
  });

  it("skips a candidate TheMovieDB has deleted and tries the next", async () => {
    // Search is served from an index that outlives the record, so a person
    // deleted since it was built is still listed and then 404s on lookup. That
    // used to take down the whole venue's transform.
    mockSearchPerson.mockResolvedValue(twoPeopleNamed("Scott Ellis"));
    mockPersonMovieCredits
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce(directedFilm(550, "Some Film"));

    const match = await searchForBestMatch(listing("some film", "Scott Ellis"));

    expect(match).toEqual({ id: 550, title: "Some Film", job: "Director" });
    expect(mockPersonMovieCredits).toHaveBeenCalledTimes(2);
  });

  it("fails when the credits lookup could not be answered at all", async () => {
    // A 500 says nothing about whether the person has the credit, so carrying
    // on would turn an outage into a run of wrong answers. It is retried
    // first, hence the fake timers - the retry budget is minutes long.
    jest.useFakeTimers();
    mockSearchPerson.mockResolvedValue(twoPeopleNamed("Scott Ellis"));
    mockPersonMovieCredits.mockRejectedValue(httpError(500));

    // Attach the handler before driving the timers, so the rejection can't
    // land unhandled while the retry sleeps are being run out.
    const settled = searchForBestMatch(
      listing("some film", "Scott Ellis"),
    ).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await jest.runAllTimersAsync();

    const { error } = await settled;
    expect(error.message).toBe("Request failed with status code 500");
    jest.useRealTimers();
  });
});

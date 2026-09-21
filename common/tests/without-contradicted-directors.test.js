const { silenceConsoleLog } = require("../test-utils");

silenceConsoleLog();

// The credits lookup each candidate is checked against, stubbed. Prefixed
// `mock` so jest's hoisting lets the factory below close over it.
const mockMovieInfo = jest.fn();

jest.mock("moviedb-promise", () => ({
  MovieDb: class {
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

const { withoutContradictedDirectors } = require("../get-movie-data");

const httpError = (status) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, headers: {} },
  });

// TheMovieDB always sends an original_title, and the title comparison reads
// it for any candidate whose own title does not match.
const candidate = (id, title) => ({
  id,
  title,
  original_title: title,
  release_date: "2026-01-01",
});

const credits = (directors, cast = []) => ({
  credits: {
    crew: directors.map((name) => ({ name, job: "Director" })),
    cast: cast.map((name) => ({ name })),
  },
});

// A short as a programme hands it to matching: the director it was billed
// with, and no cast.
const listing = (title, directors, extra = {}) => ({
  title,
  overview: { directors, actors: [], ...extra.overview },
  ...(extra.matchingHints && { matchingHints: extra.matchingHints }),
});

const idsOf = (results) => results.map(({ id }) => id);

describe("withoutContradictedDirectors", () => {
  beforeEach(() => mockMovieInfo.mockReset());

  test("removes a same-titled film made by someone other than the billed director", async () => {
    // LIFF's "Little Brother" is Jack Sambrook's short; 1397385 is Matt
    // Spicer's feature of the same name.
    mockMovieInfo.mockResolvedValue(credits(["Matt Spicer"]));
    const kept = await withoutContradictedDirectors(
      [candidate(1397385, "Little Brother")],
      listing("Little Brother", ["Jack Sambrook"]),
      "little brother",
    );
    expect(kept).toEqual([]);
  });

  test("keeps a same-titled film the billed director made", async () => {
    mockMovieInfo.mockResolvedValue(credits(["Christopher Nolan"]));
    const kept = await withoutContradictedDirectors(
      [candidate(1368337, "The Odyssey")],
      listing("The Odyssey", ["Christopher Nolan"]),
      "the odyssey",
    );
    expect(idsOf(kept)).toEqual([1368337]);
  });

  test("keeps a film whose credits name no director - no evidence either way", async () => {
    mockMovieInfo.mockResolvedValue(credits([]));
    const kept = await withoutContradictedDirectors(
      [candidate(1652009, "Zombie")],
      listing("Zombie", ["Danny Millar"]),
      "zombie",
    );
    expect(idsOf(kept)).toEqual([1652009]);
  });

  test("keeps a film the crew check would accept on its cast", async () => {
    // A different director, but a billed actor in its cast: the crew check
    // accepts that, and a film it accepts is not contradicted.
    mockMovieInfo.mockResolvedValue(credits(["Someone Else"], ["Dick Powell"]));
    const kept = await withoutContradictedDirectors(
      [candidate(1834, "Murder, My Sweet")],
      listing("Murder, My Sweet", ["Edward Dmytryk"], {
        overview: { actors: ["Dick Powell"] },
      }),
      "murder my sweet",
    );
    expect(idsOf(kept)).toEqual([1834]);
  });

  test("leaves a film with a different title alone - only the same-titled set is judged", async () => {
    mockMovieInfo.mockResolvedValue(credits(["Tekin Girgin"]));
    const kept = await withoutContradictedDirectors(
      [candidate(493416, "Troy: The Odyssey")],
      listing("The Odyssey", ["Christopher Nolan"]),
      "the odyssey",
    );
    expect(idsOf(kept)).toEqual([493416]);
    expect(mockMovieInfo).not.toHaveBeenCalled();
  });

  test("does nothing when only a synopsis-extracted name is available", async () => {
    // matchingHints.crew comes from name extraction and is too often wrong to
    // be what rules a film out.
    mockMovieInfo.mockResolvedValue(credits(["Matt Spicer"]));
    const kept = await withoutContradictedDirectors(
      [candidate(1397385, "Little Brother")],
      listing("Little Brother", [], {
        matchingHints: { crew: ["A Name From The Blurb"] },
      }),
      "little brother",
    );
    expect(idsOf(kept)).toEqual([1397385]);
    expect(mockMovieInfo).not.toHaveBeenCalled();
  });

  test("exempts opera and ballet relays, whose listed directors are usually wrong", async () => {
    mockMovieInfo.mockResolvedValue(credits(["Someone Else"]));
    const kept = await withoutContradictedDirectors(
      [candidate(1286766, "The Metropolitan Opera: Salome")],
      listing("The Metropolitan Opera: Salome", ["A Stage Director"]),
      "metropolitan opera 2026 salome",
    );
    expect(idsOf(kept)).toEqual([1286766]);
    expect(mockMovieInfo).not.toHaveBeenCalled();
  });

  test("keeps an entry the search lists but the lookup can no longer find", async () => {
    mockMovieInfo.mockRejectedValue(httpError(404));
    const kept = await withoutContradictedDirectors(
      [candidate(1, "Bacon")],
      listing("Bacon", ["Paula Bagley"]),
      "bacon",
    );
    expect(idsOf(kept)).toEqual([1]);
  });

  test("removes only the contradicted candidate from a mixed list", async () => {
    mockMovieInfo.mockImplementation(async ({ id }) =>
      id === 1756824 ? credits(["Cecilia Crabtree"]) : credits([]),
    );
    const kept = await withoutContradictedDirectors(
      [
        candidate(1756824, "Bacon"),
        candidate(2, "Bacon"),
        candidate(3, "Bacon Wars"),
      ],
      listing("Bacon", ["Paula Bagley"]),
      "bacon",
    );
    expect(idsOf(kept)).toEqual([2, 3]);
  });
});

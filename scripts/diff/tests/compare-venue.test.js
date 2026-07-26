const { compareVenue } = require("../compare-venue");

const AS_OF = new Date("2026-07-26T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const showing = (overrides = {}) => ({
  showingId: "venue.com-1",
  title: "Fight Club",
  url: "https://venue.com/fight-club",
  category: "movie",
  overview: { categories: [], directors: [], actors: [] },
  performances: [{ time: AS_OF + DAY }],
  ...overrides,
});

describe("compareVenue", () => {
  it("reports a showing only in the current release as added", () => {
    const { showings, futurePerformances } = compareVenue(
      [
        showing({
          performances: [{ time: AS_OF + DAY }, { time: AS_OF + 2 * DAY }],
        }),
      ],
      [],
      AS_OF,
    );

    expect(showings.added).toEqual([
      {
        showingId: "venue.com-1",
        title: "Fight Club",
        url: "https://venue.com/fight-club",
        category: "movie",
        futurePerformanceCount: 2,
        nextPerformance: AS_OF + DAY,
        performances: [AS_OF + DAY, AS_OF + 2 * DAY],
      },
    ]);
    expect(showings.removed).toHaveLength(0);
    expect(futurePerformances.previousTotal).toBe(0);
  });

  it("carries the movie match and seen time onto added showings", () => {
    const themoviedb = {
      id: 550,
      title: "Fight Club",
      releaseDate: "1999-10-15",
      summary: "A long summary that the feed does not need.",
    };
    const { showings } = compareVenue(
      [showing({ seen: 1783011656809, themoviedb })],
      [],
      AS_OF,
    );

    // Only the fields a feed entry needs — not the full TMDB record
    expect(showings.added[0].themoviedb).toEqual({
      id: 550,
      title: "Fight Club",
      releaseDate: "1999-10-15",
    });
    expect(showings.added[0].seen).toBe(1783011656809);
  });

  it("carries the multiple-movies matches onto added showings", () => {
    const { showings } = compareVenue(
      [
        showing({
          category: "multiple-movies",
          themoviedbs: [
            { id: 1, title: "One", releaseDate: "1999-01-01", summary: "a" },
            { id: 2, title: "Two", releaseDate: "2000-01-01", summary: "b" },
          ],
        }),
      ],
      [],
      AS_OF,
    );

    expect(showings.added[0].themoviedbs).toEqual([
      { id: 1, title: "One", releaseDate: "1999-01-01" },
      { id: 2, title: "Two", releaseDate: "2000-01-01" },
    ]);
  });

  it("only reports removed showings that still had performances to come", () => {
    const { showings, futurePerformances } = compareVenue(
      [],
      [
        showing({ showingId: "venue.com-future" }),
        showing({
          showingId: "venue.com-past",
          performances: [{ time: AS_OF - DAY }],
        }),
      ],
      AS_OF,
    );

    expect(showings.removed).toHaveLength(1);
    expect(showings.removed[0].showingId).toBe("venue.com-future");
    expect(futurePerformances.removed).toBe(1);
  });

  it("sorts removed showings by how many performances were lost", () => {
    const { showings } = compareVenue(
      [],
      [
        showing({ showingId: "venue.com-small" }),
        showing({
          showingId: "venue.com-big",
          performances: [
            { time: AS_OF + DAY },
            { time: AS_OF + 2 * DAY },
            { time: AS_OF + 3 * DAY },
          ],
        }),
      ],
      AS_OF,
    );

    expect(showings.removed.map((s) => s.showingId)).toEqual([
      "venue.com-big",
      "venue.com-small",
    ]);
  });

  it("reports metadata changes on a showing present in both releases", () => {
    const { showings } = compareVenue(
      [
        showing({
          title: "New",
          url: "https://venue.com/new",
          category: "event",
        }),
      ],
      [
        showing({
          title: "Old",
          url: "https://venue.com/old",
          category: "movie",
        }),
      ],
      AS_OF,
    );

    expect(showings.modified).toHaveLength(1);
    expect(showings.modified[0].metadata).toEqual({
      titleChanged: { from: "Old", to: "New" },
      urlChanged: {
        from: "https://venue.com/old",
        to: "https://venue.com/new",
      },
      categoryChanged: { from: "movie", to: "event" },
    });
  });

  it("treats a small time shift as a reschedule rather than a swap", () => {
    const { showings, futurePerformances } = compareVenue(
      [showing({ performances: [{ time: AS_OF + DAY + 30 * 60 * 1000 }] })],
      [showing({ performances: [{ time: AS_OF + DAY }] })],
      AS_OF,
    );

    expect(futurePerformances.rescheduled).toBe(1);
    expect(futurePerformances.added).toBe(0);
    expect(futurePerformances.removed).toBe(0);
    // Under the tolerance, so not worth listing as a modified showing
    expect(showings.modified).toHaveLength(0);
  });

  it("treats a shift beyond the tolerance as a removal and an addition", () => {
    const { showings, futurePerformances } = compareVenue(
      [showing({ performances: [{ time: AS_OF + DAY + 3 * HOUR }] })],
      [showing({ performances: [{ time: AS_OF + DAY }] })],
      AS_OF,
    );

    expect(futurePerformances.rescheduled).toBe(0);
    expect(futurePerformances.added).toBe(1);
    expect(futurePerformances.removed).toBe(1);
    expect(showings.modified[0].performances).toEqual({
      previousCount: 1,
      currentCount: 1,
      added: [AS_OF + DAY + 3 * HOUR],
      removed: [AS_OF + DAY],
      rescheduled: 0,
    });
  });

  it("ignores performances that have already happened", () => {
    const { showings, futurePerformances } = compareVenue(
      [showing({ performances: [{ time: AS_OF + DAY }] })],
      [
        showing({
          performances: [{ time: AS_OF - DAY }, { time: AS_OF + DAY }],
        }),
      ],
      AS_OF,
    );

    expect(showings.modified).toHaveLength(0);
    expect(futurePerformances.previousTotal).toBe(1);
  });

  it("reports gained, lost and changed movie matches", () => {
    const tmdb = (id) => ({
      id,
      title: `Movie ${id}`,
      releaseDate: "1999-10-15",
      summary: "",
    });

    const { tmdbChanges } = compareVenue(
      [
        showing({ showingId: "venue.com-gained", themoviedb: tmdb(1) }),
        showing({ showingId: "venue.com-lost" }),
        showing({ showingId: "venue.com-changed", themoviedb: tmdb(3) }),
      ],
      [
        showing({ showingId: "venue.com-gained" }),
        showing({ showingId: "venue.com-lost", themoviedb: tmdb(2) }),
        showing({ showingId: "venue.com-changed", themoviedb: tmdb(4) }),
      ],
      AS_OF,
    );

    expect(
      tmdbChanges.map(({ showingId, single }) => [showingId, single.type]),
    ).toEqual([
      ["venue.com-gained", "gained"],
      ["venue.com-lost", "lost"],
      ["venue.com-changed", "changed"],
    ]);
  });
});

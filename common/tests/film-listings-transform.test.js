const transform = require("../source-only/film-listings-transform");

const listing = (title, matchingHints) => ({
  title,
  performances: [],
  matchingHints,
});

describe("film-listings transform", () => {
  it("keeps a listing whose title or description says it is a film", async () => {
    const events = [
      listing("Sunday Film Screening", { overview: "" }),
      listing("Karaoke Knights by Friday Knights", { overview: "Sing along" }),
    ];
    const result = await transform({}, { source: events });
    expect(result.map(({ title }) => title)).toEqual(["Sunday Film Screening"]);
  });

  // A film club's own blurb need not use any of the film keywords, so a source
  // that knows the organiser only puts on film says so and the listing stays
  it("keeps a listing from a film organiser whatever its wording", async () => {
    const events = [
      listing("Coming of Age Special", {
        overview: "Two powerful, women-directed films",
        filmOrganiser: true,
      }),
      listing("Coming of Age Special", {
        overview: "Two powerful, women-directed films",
      }),
    ];
    const result = await transform({}, { source: events });
    expect(result).toHaveLength(1);
    expect(result[0].matchingHints.filmOrganiser).toBe(true);
  });
});

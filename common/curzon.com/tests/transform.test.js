const transform = require("../transform");

const attributes = {
  id: "curzon.com-test",
  name: "Curzon Test",
  domain: "https://www.curzon.com",
};

// One showtime day as the OCAPI returns it, trimmed to what transform reads,
// with a single performance carrying the given attribute.
const showtimeDay = (attribute) => ({
  showtimes: [
    {
      filmId: "F1",
      screenId: "S1",
      schedule: { startsAt: "2026-11-15T14:00:00Z" },
      attributeIds: [attribute.id],
      isSoldOut: false,
    },
  ],
  relatedData: {
    sites: [{ id: "TST1" }],
    films: [
      {
        id: "F1",
        title: { text: "Flow" },
        runtimeInMinutes: 85,
        genreIds: [],
        castAndCrew: [],
        censorRatingId: null,
      },
    ],
    censorRatings: [],
    genres: [],
    castAndCrew: [],
    screens: [{ id: "S1", name: { text: "Screen 1" } }],
    attributes: [attribute],
  },
});

const transformWith = async (attribute) => {
  const [movie] = await transform(attributes, [showtimeDay(attribute)], {});
  return movie.performances[0];
};

describe("curzon transform performance attributes", () => {
  it("flags a dementia screening as relaxed and keeps its note", async () => {
    const description =
      "Monthly screenings for people living with dementia and their carers.";
    const performance = await transformWith({
      id: "A1",
      name: { text: "Dementia" },
      description: { text: description },
    });

    expect(performance.accessibility).toEqual({ relaxed: true });
    expect(performance.notes).toBe(`Dementia: ${description}`);
  });

  it("flags a relaxed screening without repeating it in the notes", async () => {
    const performance = await transformWith({
      id: "A1",
      name: { text: "Relaxed" },
      description: { text: "A relaxed screening." },
    });

    expect(performance.accessibility).toEqual({ relaxed: true });
    expect(performance.notes).toBeFalsy();
  });
});

const {
  splitConjoinedItemsInList,
  convertNamesTextToList,
  createOverview,
} = require("../utils");

describe("splitConjoinedItemsInList", () => {
  it("splits items joined by the conjunction", () => {
    expect(splitConjoinedItemsInList(["Ant and Dec"])).toEqual(["Ant", "Dec"]);
  });

  it("strips a conjunction left stranded by an Oxford comma", () => {
    expect(splitConjoinedItemsInList(["and Michael Fassbender"])).toEqual([
      "Michael Fassbender",
    ]);
  });

  it("strips a capitalised stranded conjunction", () => {
    expect(splitConjoinedItemsInList(["And Michael Fassbender"])).toEqual([
      "Michael Fassbender",
    ]);
  });

  it("leaves names that merely start with the conjunction alone", () => {
    expect(
      splitConjoinedItemsInList(["Andrea Arnold", "Anderson Cooper"]),
    ).toEqual(["Andrea Arnold", "Anderson Cooper"]);
  });

  it("drops an item that is only the conjunction", () => {
    expect(splitConjoinedItemsInList(["Ken Loach", "and"])).toEqual([
      "Ken Loach",
    ]);
  });

  it("honours a custom joiner", () => {
    expect(splitConjoinedItemsInList(["Drama with Comedy"], " with ")).toEqual([
      "Drama",
      "Comedy",
    ]);
    expect(splitConjoinedItemsInList(["with Comedy"], " with ")).toEqual([
      "Comedy",
    ]);
  });
});

describe("convertNamesTextToList", () => {
  it("reads a cast list written with an Oxford comma", () => {
    expect(
      convertNamesTextToList(
        "Móglaí Bap, Mo Chara, DJ Próvaí, and Michael Fassbender",
      ),
    ).toEqual(["Móglaí Bap", "Mo Chara", "DJ Próvaí", "Michael Fassbender"]);
  });

  it("reads a cast list written without an Oxford comma", () => {
    expect(
      convertNamesTextToList("Móglaí Bap, Mo Chara and Michael Fassbender"),
    ).toEqual(["Móglaí Bap", "Mo Chara", "Michael Fassbender"]);
  });
});

describe("createOverview", () => {
  it("strips a stranded conjunction from actors and directors", () => {
    const overview = createOverview({
      directors: "Joel Coen, and Ethan Coen",
      actors: "Frances McDormand, and Steve Buscemi",
    });

    expect(overview.directors).toEqual(["Joel Coen", "Ethan Coen"]);
    expect(overview.actors).toEqual(["Frances McDormand", "Steve Buscemi"]);
  });

  it("strips a stranded conjunction from categories", () => {
    expect(
      createOverview({ categories: "Drama, Comedy, and Romance" }),
    ).toEqual(
      expect.objectContaining({
        categories: ["Drama", "Comedy", "Romance"],
      }),
    );
  });
});

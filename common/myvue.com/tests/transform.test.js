const transform = require("../transform");
const { expectedClosures } = require("../../expected-closures");

const attributes = {
  id: "myvue.com-finchley-road",
  name: "Vue Finchley Road",
  domain: "https://www.myvue.com",
  url: "https://www.myvue.com/cinema/finchley-road",
};

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// A closed cinema and a broken scrape look identical from here: the API answers
// `responseCode: 0` with no films either way.
const noListings = { result: [] };

describe("myvue transform with no listings", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    await expect(transform(attributes, noListings, {})).rejects.toThrow(
      "No movies found - the page structure may have changed",
    );
  });

  (closure ? it : it.skip)(
    "returns nothing while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(transform(attributes, noListings, {})).resolves.toEqual([]);
    },
  );

  (closure ? it : it.skip)(
    "does not stand down for the rest of the chain",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(
        transform({ ...attributes, id: "myvue.com-islington" }, noListings, {}),
      ).rejects.toThrow(
        "No movies found - the page structure may have changed",
      );
    },
  );
});

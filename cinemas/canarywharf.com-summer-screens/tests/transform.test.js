const transform = require("../transform");
const attributes = require("../attributes");
const { expectedClosures } = require("../../../common/expected-closures");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

// Out of season the estate deletes the season's event page, so the retrieve
// stores the site's 404 - which carries no accordion, exactly like a redesign
// would.
const outOfSeasonPage = `<html><body class="error404"><h1>Page not found</h1></body></html>`;

describe("canary wharf summer screens transform with no listings", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("fails when the venue is not expected to be closed", async () => {
    setToday("2026-07-11");
    await expect(
      transform({ movieListPage: outOfSeasonPage }, {}),
    ).rejects.toThrow("No movies found — page structure may have changed");
  });

  (closure ? it : it.skip)(
    "returns nothing while the venue is expected to be closed",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(
        transform({ movieListPage: outOfSeasonPage }, {}),
      ).resolves.toEqual([]);
    },
  );
});

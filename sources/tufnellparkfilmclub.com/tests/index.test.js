/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-02-17"));

  it(
    "retrieve and find events for matching venue",
    async () => {
      const { movieListPage } = await retrieve();

      expect(movieListPage).toBeTruthy();
      expect(movieListPage).toContain("eventlist-event--upcoming");

      readJSON.mockImplementation(() => ({ movieListPage }));

      const cinema = {
        name: "The Vine",
        alternativeNames: ["Vine NW5", "Vine"],
        address: "86 Highgate Road, London, NW5 1PB, UK",
        geo: { lat: 51.55481925850424, lon: -0.14440595173848939 },
      };
      const output = await findEvents(cinema);

      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(schemaValidate(data)).toBe(true);
      expect(data).toHaveLength(3);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 600_000 : undefined,
  );

  it("returns no events for unrelated cinema", async () => {
    const { movieListPage } = await retrieve();

    readJSON.mockImplementation(() => ({ movieListPage }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

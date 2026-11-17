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
  jest.useFakeTimers().setSystemTime(new Date("2026-10-19"));

  describe.each([
    {
      name: "The People's Letters Bookshop",
      alternativeNames: ["Co-operative bookshop"],
      address: "395 Cambridge Heath Road, Bethnal Green, London, E2 9RA, UK",
      geo: { lat: 51.53076013335542, lon: -0.05642618638148895 },
      expectedMatches: 1,
    },
    {
      // The club's usual home, with nothing there in this recording.
      name: "Pelican House",
      alternativeNames: [],
      address: "144 Cambridge Heath Road, Bethnal Green, London, E1 5QJ, UK",
      geo: { lat: 51.5241916812964, lon: -0.054707535680199156 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toHaveLength(1);

        readJSON.mockImplementation(() => ({ movieListPages }));

        const cinema = { name, alternativeNames, address, geo };
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
        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });

  it("returns no events for unrelated cinema", async () => {
    const { movieListPages } = await retrieve();

    readJSON.mockImplementation(() => ({ movieListPages }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

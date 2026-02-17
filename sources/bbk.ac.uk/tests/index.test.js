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

// Hide script output
console.log = () => {};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-10-30"));

  describe.each([
    {
      name: "Birkbeck Cinema",
      alternativeNames: [
        "Birkbeck",
        "Gordon Square",
        "Birkbeck 43 Gordon Square",
        "Birkbeck Institute for the Moving Image",
      ],
      geo: { lat: 51.52466462157211, lon: -0.13033861877673095 },
      expectedMatches: 4,
    },
    {
      name: "Birkbeck Central",
      alternativeNames: [
        "Birkbeck",
        "Malet Street",
        "Birkbeck, University of London",
        "Birkbeck Library",
        "Birkbeck Clore Management Centre",
        "Birkbeck Main Building",
      ],
      geo: { lat: 51.52199660997907, lon: -0.13026175425819903 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPage, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPage).toBeTruthy();
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(5);

        readJSON.mockImplementation(() => ({ movieListPage, moviePages }));

        const cinema = { name, alternativeNames, geo };
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
});

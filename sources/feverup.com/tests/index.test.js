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

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-02-17"));

  describe.each([
    {
      name: "The Refinery Citypoint",
      alternativeNames: ["The Refinery City Point"],
      address: "1 Ropemaker Street, London, EC2Y 9HT, UK",
      geo: { lat: 51.519140879706114, lon: -0.09002136809499772 },
      expectedMatches: 2,
    },
    {
      name: "The Moniker",
      alternativeNames: [],
      address: "25 Fenchurch Avenue, London, EC3M 5AD, UK",
      geo: { lat: 51.51277895188951, lon: -0.08078508800736149 },
      expectedMatches: 2,
    },
    {
      name: "Parlour",
      alternativeNames: ["Parlour Kensal", "The Parlour"],
      address: "5 Regent Street, London, NW10 5LG, UK",
      geo: { lat: 51.52876791379925, lon: -0.2166160120141102 },
      expectedMatches: 2,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPage, moviePages, sessionPages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPage).toBeTruthy();
        expect(moviePages).toBeTruthy();
        expect(sessionPages).toBeTruthy();

        readJSON.mockImplementation(() => ({
          movieListPage,
          moviePages,
          sessionPages,
        }));

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
});

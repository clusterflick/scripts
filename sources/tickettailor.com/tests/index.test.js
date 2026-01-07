/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, setupCacheMock } = require("../../../common/test-utils");
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

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-01-07");

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-01-07"));

  describe.each([
    {
      name: "Coldharbour Blue",
      alternativeNames: ["Cold Harbour Blue", "Whirled Cinema"],
      address:
        "259-260 Hardess Street, Loughborough Junction, London, SE24 0HN, UK",
      expectedMatches: 1,
    },
    {
      name: "Good Shepherd Studios",
      alternativeNames: ["We Flock CIC"],
      address: "15A Davies Lane, Leytonstone, London, E11 3DR, UK",
      expectedMatches: 2,
    },
    {
      name: "Siobhan Davies Studios",
      alternativeNames: [],
      address: "85 St George's Road, London, SE1 6ER, UK",
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { clubPages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(clubPages).toBeTruthy();
        expect(Object.keys(clubPages)).toHaveLength(3);

        readJSON.mockImplementation(() => ({ clubPages }));

        const cinema = { name, alternativeNames, address };
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
        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });
});

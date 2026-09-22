/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  silenceConsoleLog,
} = require("../../../common/test-utils");
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

silenceConsoleLog();

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-09-22"));

  describe.each([
    {
      name: "Close-Up Film Centre",
      alternativeNames: ["Close-Up Cinema"],
      address: "97 Sclater Street, London, E1 6HR, UK",
      geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
      expectedMatches: 2,
    },
    {
      // Reached only by search - the browse feed omits it at every slug.
      name: "The Roof Gardens",
      alternativeNames: ["Kensington Roof Gardens"],
      address: "99 Kensington High Street, London, W8 5SA, UK",
      geo: { lat: 51.5010397, lon: -0.1914084 },
      expectedMatches: 1,
    },
    {
      // Listed under the members' club that contains the cinema, so this only
      // matches through alternativeNames.
      name: "Electric Cinema White City",
      alternativeNames: ["White City House", "Soho House White City"],
      address: "2 Television Centre, 101 Wood Lane, London, W12 7FR, UK",
      geo: { lat: 51.510808063329954, lon: -0.22545809809352405 },
      expectedMatches: 1,
    },
    {
      name: "Vue West End",
      alternativeNames: ["Vue West End - Leicester Square"],
      address: "Leicester Square, 3 Cranbourn Street, London, WC2H 7AL, UK",
      geo: { lat: 51.51154027444083, lon: -0.12948804448422094 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(Object.keys(events)).toHaveLength(175);

        readJSON.mockImplementation(() => ({ events }));

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

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
  jest.useFakeTimers().setSystemTime(new Date("2026-11-04"));

  describe.each([
    {
      name: "Mosaic Rooms",
      address: "226 Cromwell Road, London, SW5 0SW, UK",
      geo: { lat: 51.49489161176316, lon: -0.19535549193482035 },
      // Four events, three of which are on the non-film list. What's left is
      // the book arts launch, which screens a short.
      expectedMatches: 1,
    },
    {
      // Not a venue we hold yet. Its details are Tzkrti's own, so this only
      // shows that an event lists at the place it says it is.
      name: "EDAMI",
      address: "73-75 Shacklewell Ln, London E8 2EB, UK",
      geo: { lat: 51.5525048, lon: -0.0712408 },
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
        expect(Object.keys(events)).toHaveLength(12);
        // The organiser's account carries personal details, and never
        // reaches retrieved data.
        expect(
          Object.values(events).some((event) =>
            Object.prototype.hasOwnProperty.call(event, "user"),
          ),
        ).toBe(false);

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

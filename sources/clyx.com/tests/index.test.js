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
  jest.useFakeTimers().setSystemTime(new Date("2026-09-15"));

  describe.each([
    {
      name: "Mason & Fifth",
      alternativeNames: ["Mason & Fifth, Westbourne Park"],
      address: "11a Woodfield Road, London, W9 2BA, UK",
      geo: { lat: 51.52257036848836, lon: -0.19969324848052622 },
      expectedMatches: 1,
    },
    {
      name: "Vue West End",
      alternativeNames: ["Vue West End - Leicester Square"],
      address: "Leicester Square, 3 Cranbourn Street, London, WC2H 7AL, UK",
      geo: { lat: 51.51154027444083, lon: -0.12948804448422094 },
      expectedMatches: 1,
    },
    {
      name: "The Woodfield Pavilion",
      alternativeNames: ["The Woodfield"],
      address: "16A Abbotswood Road, Tooting Common, London, SW16 1AP, UK",
      geo: { lat: 51.4379269791229, lon: -0.1385254728928368 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct. The feed is every event
        // Clyx has on in London rather than the film ones, so most of these
        // belong to no venue we hold.
        expect(events).toBeTruthy();
        expect(Object.keys(events)).toHaveLength(27);

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

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

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-09-23"));

  describe.each([
    {
      name: "Finch Community Cinema",
      alternativeNames: ["Finch Cafe/Restaurant"],
      address: "12 Sidworth Street, London, E8 3SD, UK",
      geo: { lat: 51.53977173949334, lon: -0.05752235164484993 },
      expectedMatches: 2,
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events, eventPages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(events).toHaveLength(25);
        expect(Object.keys(eventPages)).toHaveLength(25);

        readJSON.mockImplementation(() => ({ events, eventPages }));

        const cinema = { name, alternativeNames, address, geo };
        const output = await findEvents(cinema);
        expect(
          output.every((movie) =>
            Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
          ),
        ).toBe(true);
        // Every event's description comes off its own page
        expect(output.every((movie) => movie.matchingHints.overview)).toBe(
          true,
        );

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

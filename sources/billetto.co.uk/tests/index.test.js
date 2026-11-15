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
  jest.useFakeTimers().setSystemTime(new Date("2026-11-15"));

  describe.each([
    {
      name: "The Cabbage Patch",
      geo: { lat: 51.449, lon: -0.329866 },
      expectedMatches: 1,
    },
    {
      // Billetto names the room first - "Richard Hoggart Building, Goldsmiths"
      name: "Goldsmiths",
      alternativeNames: [
        "Richard Hoggart Building",
        "Goldsmiths, University of London",
      ],
      geo: { lat: 51.47454075854443, lon: -0.035107215284682844 },
      expectedMatches: 1,
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio"],
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(Object.keys(events)).toHaveLength(4);

        readJSON.mockImplementation(() => ({ events }));

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

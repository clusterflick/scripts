/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
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

// DICE refused the plain fetch when this was recorded (2026-11-15), so Polly
// holds only that 403, which is what sends the retrieve to Camoufox. Polly only
// sees `fetch`, so the browser's result is replayed from the daily cache
// instead: `cache/dice-fm-events-<date>` from a real retrieve, copied into
// __manual-recordings__. Re-recording means a fresh retrieve and copying that
// file across with the new date, as well as re-running with isRecording on.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-11-15");

silenceConsoleLog();

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-15"));

  describe.each([
    {
      name: "The Haggerston",
      geo: { lat: 51.54248341521672, lon: -0.07580767288892457 },
      expectedMatches: 9,
    },
    {
      name: "Hackney Picturehouse",
      geo: { lat: 51.54474966715274, lon: -0.055025638908993514 },
      expectedMatches: 4,
    },
    {
      name: "The Clapham Grand",
      geo: { lat: 51.463318751977546, lon: -0.16939900181385437 },
      expectedMatches: 3,
    },
    {
      // Riot Party's social, reached only through the promoter list
      name: "Brixton Jamm",
      alternativeNames: ["The Brixton Courtyard"],
      geo: { lat: 51.4708, lon: -0.11186 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();

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

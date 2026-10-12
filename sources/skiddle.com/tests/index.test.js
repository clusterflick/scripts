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
  jest.useFakeTimers().setSystemTime(new Date("2026-10-12"));

  describe.each([
    {
      // A seeded venue, so its whole programme is retrieved - neither event is
      // a film, and it is the venue's transform that decides what to keep
      name: "Plaza Camden",
      address: "14 Parkway, London, NW1 7AA, UK",
      geo: { lat: 51.53884451152027, lon: -0.1435284534180323 },
      expectedMatches: 2,
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct - the one event filed
        // under film in London, and the two at Plaza Camden
        expect(events).toHaveLength(3);

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

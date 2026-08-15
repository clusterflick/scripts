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
  jest.useFakeTimers().setSystemTime(new Date("2026-08-15"));

  describe.each([
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 1,
    },
    {
      name: "Close-Up Film Centre",
      alternativeNames: ["Close-Up Cinema"],
      address: "97 Sclater Street, London, E1 6HR, UK",
      geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
      expectedMatches: 1,
    },
    {
      name: "Finsbury Park Picturehouse",
      address: "Unit 1 Cinema LS, 17 City North Place, London, N4 3FU, UK",
      geo: { lat: 51.56517572070054, lon: -0.10757585022923707 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events, eventPages, venues } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(eventPages).toBeTruthy();
        expect(venues).toBeTruthy();

        readJSON.mockImplementation(() => ({ events, eventPages, venues }));

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

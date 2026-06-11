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
  jest.useFakeTimers().setSystemTime(new Date("2026-06-11"));

  describe.each([
    {
      name: "The Fellowship Cinema",
      alternativeNames: ["The Fellowship Inn"],
      address: "Randlesdown Road, London, SE6 3BT, UK",
      geo: { lat: 51.433108588491734, lon: -0.019912945972504828 },
      expectedMatches: 1,
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
        const { events } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(events).toHaveLength(16);

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

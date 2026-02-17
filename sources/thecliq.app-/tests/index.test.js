/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// Hide script output
console.log = () => {};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-02-12"));

  describe.each([
    {
      name: "Galleria Objets",
      geo: { lat: 51.519474, lon: -0.0716479 },
      expectedMatches: 1,
    },
    {
      name: "Ciné-Real",
      alternativeNames: ["Ciné Real", "Umit & Son"],
      geo: { lat: 51.55094644321261, lon: -0.05260928393354228 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { clubs } = await retrieve();

        // Make sure the input looks roughly correct
        expect(clubs).toBeTruthy();
        expect(Object.keys(clubs)).toHaveLength(4);

        readJSON.mockImplementation(() => ({ clubs }));

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

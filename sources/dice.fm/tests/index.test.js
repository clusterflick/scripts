/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly } = require("../../../common/test-utils");
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
  jest.useFakeTimers().setSystemTime(new Date("2026-02-13"));

  let events;

  beforeAll(async () => {
    const data = await retrieve();
    events = data.events;
  }, 600_000);

  it("retrieves events", () => {
    expect(events).toBeTruthy();
    expect(events.length).toBeGreaterThan(0);
  });

  describe.each([
    {
      name: "The Haggerston",
      geo: { lat: 51.54248341521672, lon: -0.07580767288892457 },
      expectedMatches: 16,
    },
    {
      name: "St Matthias Church",
      alternativeNames: ["Saint Matthias Church"],
      geo: { lat: 51.55251101625857, lon: -0.07912725093596235 },
      expectedMatches: 1,
    },
    {
      name: "Institute of Contemporary Arts",
      alternativeNames: ["ICA Cinema", "ICA (Institute of Contemporary Arts)"],
      geo: { lat: 51.50606885842036, lon: -0.1311647210085773 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "find events",
      async () => {
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

        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });
});

/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");
const plazaCamden = require("../../../cinemas/plazacamden.com/attributes");
const rioCinema = require("../../../cinemas/riocinema.org.uk/attributes");
const mildmayClub = require("../../../cinemas/mildmay.club/attributes");
const allIsJoySoho = require("../../../cinemas/allisjoysoho.com/attributes");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  // The shop keeps every listing it has ever sold, so the clock is set back to
  // when several of them were still to come.
  jest.useFakeTimers().setSystemTime(new Date("2024-12-01"));

  describe.each([
    { cinema: plazaCamden, expectedMatches: 1 },
    { cinema: rioCinema, expectedMatches: 2 },
    { cinema: mildmayClub, expectedMatches: 2 },
    {
      cinema: { name: "Some Other Cinema", alternativeNames: [] },
      expectedMatches: 0,
    },
  ])("$cinema.name", ({ cinema, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { products } = await retrieve();

        // Make sure the input looks roughly correct
        expect(products).toHaveLength(71);

        readJSON.mockImplementation(() => ({ products }));

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

  // "This Good Friday ... The Long Good Friday" at All is Joy, 18 April 2025,
  // gives no time anywhere in its listing
  it("throws for a matching screening with no start time", async () => {
    const { products } = await retrieve();

    readJSON.mockImplementation(() => ({ products }));

    await expect(findEvents(allIsJoySoho)).rejects.toThrow(/No start time/);
  });
});

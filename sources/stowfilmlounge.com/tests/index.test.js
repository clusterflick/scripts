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

const townHallCinema = {
  name: "Waltham Forest Town Hall",
};

const signatureBreweryCinema = {
  name: "Signature Brewery",
  alternativeNames: [
    "Signature Brew Taproom",
    "Signature Brew Blackhorse Road",
  ],
};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-01-10"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPage } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(movieListPage).toContain("STOW FILM LOUNGE");

      readJSON.mockImplementation(() => ({ movieListPage }));

      const townHallOutput = await findEvents(townHallCinema);

      expect(
        townHallOutput.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const townHallData = JSON.parse(JSON.stringify(townHallOutput))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(townHallData).toHaveLength(3);
      expect(townHallData).toMatchSnapshot("Waltham Forest Town Hall events");

      const signatureOutput = await findEvents(signatureBreweryCinema);
      const signatureData = JSON.parse(JSON.stringify(signatureOutput))
        .map(removeMatchingHints)
        .map(addTestCategory);

      expect(signatureData).toHaveLength(2);
      expect(signatureData).toMatchSnapshot("Signature Brewery events");
    },
    isRecording ? 600_000 : undefined,
  );

  it("returns no events for unrelated cinema", async () => {
    const { movieListPage } = await retrieve();

    readJSON.mockImplementation(() => ({ movieListPage }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

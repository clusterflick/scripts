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

const langthorneParkCinema = {
  name: "Langthorne Park",
};

const stMarysChurchCinema = {
  name: "St Mary's Church Walthamstow",
  alternativeNames: ["St Mary's Church"],
};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-22"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPage } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(movieListPage).toContain("STOW FILM LOUNGE");

      readJSON.mockImplementation(() => ({ movieListPage }));

      const langthorneParkOutput = await findEvents(langthorneParkCinema);

      expect(
        langthorneParkOutput.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const langthorneParkData = JSON.parse(
        JSON.stringify(langthorneParkOutput),
      )
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(langthorneParkData).toHaveLength(2);
      expect(langthorneParkData).toMatchSnapshot("Langthorne Park events");

      const output = await findEvents(stMarysChurchCinema);
      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(schemaValidate(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data).toMatchSnapshot("St Mary's Church events");
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

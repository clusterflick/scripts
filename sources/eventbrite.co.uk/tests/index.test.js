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

const cinema = {
  name: "Genesis Cinema",
  geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2025-11-13"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPages).toBeTruthy();
      expect(movieListPages).toHaveLength(60);
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(929);

      readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

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
      expect(data).toHaveLength(5);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 3_600_000 : undefined,
  );
});

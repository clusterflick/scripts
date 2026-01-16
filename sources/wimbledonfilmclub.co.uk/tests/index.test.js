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

const cinema = {
  name: "Curzon Wimbledon",
};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-01-16"));
  it(
    "retrieve and find events",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(13);

      readJSON.mockImplementation(() => ({ movieListPage, moviePages }));

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
    isRecording ? 600_000 : undefined,
  );
  // });

  // describe("Non-matching cinema", () => {
  //   it("returns no events for unrelated cinema", async () => {
  //     const { movieListPage, moviePages } = await retrieve();

  //     readJSON.mockImplementation(() => ({ movieListPage, moviePages }));

  //     const cinema = {
  //       name: "Some Other Cinema",
  //       alternativeNames: [],
  //       address: "123 Fake Street, London, E1 1AA, UK",
  //     };
  //     const output = await findEvents(cinema);

  //     expect(output).toHaveLength(0);
  //   });
  // });
});

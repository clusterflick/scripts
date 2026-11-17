/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { fetchJson } = require("../../../common/utils");
const { getExpectedClosure } = require("../../../common/expected-closures");
const { retrieve, transform, attributes } = require("..");

jest.mock("../../../common/utils", () => {
  const actual = jest.requireActual("../../../common/utils");
  return { ...actual, fetchJson: jest.fn(actual.fetchJson) };
});
jest.mock("../../../common/expected-closures", () => ({
  ...jest.requireActual("../../../common/expected-closures"),
  getExpectedClosure: jest.fn(() => undefined),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-07-11"));

  it(
    "retrieve and transform",
    async () => {
      const response = await retrieve();

      // Make sure the input looks roughly correct
      expect(response).toBeTruthy();

      const output = sortAndFilterMovies(await transform(response, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(23);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});

// The feed once answered with an empty list under a 200, and a few hours later
// with everything. Retrieve must fail on that rather than hand it on.
describe(`${attributes.name} empty feed`, () => {
  it("throws when the feed lists no events", async () => {
    fetchJson.mockResolvedValueOnce([]);
    await expect(retrieve()).rejects.toThrow(
      "Expected a list of events from https://dzxpxc606eoab.cloudfront.net/Prod/events/20/72165/Live, got []",
    );
  });

  it("returns nothing for a declared closure", async () => {
    fetchJson.mockResolvedValueOnce([]);
    getExpectedClosure.mockReturnValueOnce({
      until: "2026-12-01",
      reason: "refurbishment",
    });
    jest.spyOn(console, "log").mockImplementationOnce(() => {});
    await expect(retrieve()).resolves.toEqual([]);
  });
});

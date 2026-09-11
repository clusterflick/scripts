/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  setupCacheMock,
} = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

// Every request runs inside a Playwright page, which Polly can't intercept, so
// the retrieve replays from a manual recording.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-09-11");

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-09-11"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPages).toHaveLength(1);
      expect(Object.keys(moviePages)).toHaveLength(16);

      const output = sortAndFilterMovies(await transform({ moviePages }, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Two of the sixteen screen a film. The other fourteen include two
      // concerts of film music that must not be picked up.
      expect(data).toHaveLength(2);
      // Title and tagline joined as the venue displays them - the tagline is
      // where the instalment is named. Trimming the redundant billing for
      // matching is `normalize-title`'s job, not this transform's.
      expect(data.map(({ title }) => title)).toEqual([
        "Interstellar Live: with The Royal Philharmonic Concert Orchestra",
        "The Lord of The Rings: The Fellowship of The Ring In Concert",
      ]);

      // Both are billed as one date but sell a matinee and an evening show,
      // which only the showings list carries - the JSON-LD has just the first.
      expect(data.map(({ performances }) => performances.length)).toEqual([
        2, 2,
      ]);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : 10_000,
  );
});

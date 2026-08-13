/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");
// Captured from a real Ticket Tailor retrieve for this venue. Five of the seven
// events it sells are talks and workshops with no film page, so an empty set
// wouldn't exercise the transform dropping them - or the enrichment, since the
// site's own listings carry no year, no booking URL and no sold-out state.
const sourcedEvents = require("./sourced-events.json");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-14"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, moviePages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(moviePages).toBeTruthy();
      expect(Object.keys(moviePages)).toHaveLength(2);

      const output = sortAndFilterMovies(
        await transform({ movieListPage, moviePages }, sourcedEvents),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      // Only the films the site lists are published - the talks and workshops
      // sharing the venue's box office are dropped.
      expect(output.map(({ title }) => title)).toEqual([
        "A Summer in La Goulette",
        "All We Imagine as Light",
      ]);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(2);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});

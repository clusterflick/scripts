/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");
const { parseEventPage } = require("../utils");

const isRecording = false;

const titles = (movies) => movies.map(({ title }) => title).sort();

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-04"));

  it(
    "retrieve and transform",
    async () => {
      const { storePage, eventPages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(storePage).toBeTruthy();
      expect(Object.keys(eventPages)).toHaveLength(4);

      const output = sortAndFilterMovies(
        await transform({ storePage, eventPages }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // The opening party shows no film; the adventure evening premieres one
      expect(titles(data)).toEqual([
        "Norrøna Freeride Film Tour",
        "TGR 31st Annual Film",
        "The Ultimate Adventure Evening",
      ]);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();

      // An event at another store is left out, however it got listed
      const [url, html] = Object.entries(eventPages).find(([key]) =>
        key.includes("tgr-31st-annual-film-london"),
      );
      const elsewhere = html.replaceAll(
        `event-location-byline-name">${attributes.name}<`,
        'event-location-byline-name">Norrøna Concept Store Zurich<',
      );
      expect(parseEventPage(elsewhere).store).toBe(
        "Norrøna Concept Store Zurich",
      );
      expect(
        await transform({ storePage, eventPages: { [url]: elsewhere } }, {}),
      ).toEqual([]);
    },
    isRecording ? 240_000 : undefined,
  );
});

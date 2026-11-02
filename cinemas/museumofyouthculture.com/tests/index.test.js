/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");
const { parseEvents } = require("../utils");

const isRecording = false;

const lumaEvent = (url) => ({
  showingId: "luma.com-evt-test",
  title: "Black Leprechaun Press Night",
  url,
  overview: { categories: [], directors: [], actors: [] },
  performances: [],
  matchingHints: {},
});

const titles = (movies) => movies.map(({ title }) => title).sort();

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-02"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage } = await retrieve();

      // Make sure the input looks roughly correct
      expect(parseEvents(movieListPage)).toHaveLength(5);

      const output = sortAndFilterMovies(
        await transform({ movieListPage }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct: She-Punks was the day before
      expect(titles(data)).toEqual([
        "An Evening with THE SLITS",
        "Black Leprechaun Press Night",
      ]);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();

      // A Luma booking gives way to the source's copy of the same event...
      const sourced = await transform(
        { movieListPage },
        { "luma.com": [lumaEvent("https://lu.ma/khagesml")] },
      );
      expect(
        sourced.filter(({ title }) => title.startsWith("Black Leprechaun")),
      ).toEqual([expect.objectContaining({ url: "https://lu.ma/khagesml" })]);

      // ...and is kept when the source found something else
      const unrelated = await transform(
        { movieListPage },
        { "luma.com": [lumaEvent("https://lu.ma/other")] },
      );
      expect(
        unrelated.filter(({ title }) => title.startsWith("Black Leprechaun")),
      ).toHaveLength(2);
    },
    isRecording ? 240_000 : undefined,
  );

  it("fails when an event breaks the date/title pattern", () => {
    expect(() =>
      parseEvents(
        '<h2 class="fl-heading">UPCOMING EVENTS</h2><div class="fl-col-group"><div class="fl-module fl-module-rich-text"><p>Coming soon</p></div></div>',
      ),
    ).toThrow("breaks the date/title pattern");
  });
});

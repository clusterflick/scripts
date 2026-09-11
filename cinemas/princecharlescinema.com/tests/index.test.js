/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-09-11"));

  it(
    "retrieve and transform",
    async () => {
      const moviePages = await retrieve();

      // Make sure the input looks roughly correct
      expect(moviePages).toBeTruthy();

      const output = sortAndFilterMovies(await transform(moviePages, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(373);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    },
    isRecording ? 240_000 : undefined,
  );
});

// The recording above predates the BFI London Film Festival, so the festival
// marker the venue drops into `.running-time` is exercised here with crafted
// markup instead: "LFF" must stay out of the film's categories and appear as a
// note on every performance.
describe(`${attributes.name} festival marker`, () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-07-11"));

  const buildPage = (propertySpans) => `
    <div class="jacro-event">
      <div class="jacrofilm-list-content">
        <a class="liveeventtitle" href="/film/some-film/">Some Film</a>
        <div class="film-info"><span>Directed by A Director</span></div>
        <div class="running-time">${propertySpans}</div>
        <div class="jacro-formatted-text">A synopsis.</div>
        <div class="performance-list-items">
          <div class="heading">Saturday 12th July</div>
          <li>
            <span class="hover">Book</span>
            <span class="time">6:00 pm</span>
            <a href="/booking/1/">Book</a>
          </li>
        </div>
      </div>
    </div>`;

  it("keeps the LFF marker out of categories and adds it to notes", async () => {
    const page = buildPage(
      "<span>2026</span><span>89mins</span><span>(18)</span><span>LFF</span>",
    );
    const [movie] = await transform({ movieListPage: page }, {});

    expect(movie.overview.categories).toEqual([]);
    expect(movie.performances).toHaveLength(1);
    expect(movie.performances[0].notes).toBe("Part of the LFF");
  });

  it("still parses genuine genre categories after the classification", async () => {
    const page = buildPage(
      "<span>2026</span><span>89mins</span><span>(18)</span><span>Drama</span>",
    );
    const [movie] = await transform({ movieListPage: page }, {});

    expect(movie.overview.categories).toEqual(["Drama"]);
    expect(movie.performances[0].notes).toBe("");
  });
});

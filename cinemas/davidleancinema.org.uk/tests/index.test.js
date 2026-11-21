/** @jest-environment setup-polly-jest/jest-environment-node */
const cheerio = require("cheerio");
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  sortAndFilterMovies,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { retrieve, transform, attributes } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  sleep: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-11"));

  it(
    "retrieve and transform",
    async () => {
      const { movieListPage, eventFeeds, eventPages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(Object.keys(eventPages)).toHaveLength(46);

      const output = sortAndFilterMovies(
        await transform({ movieListPage, eventFeeds, eventPages }, {}),
      );
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(data).toHaveLength(29); // This count is not related to the above

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();

      // On 21 November 2026 the booking links that joined each page to its
      // show vanished from every page, so a page without them is joined by the
      // day and time it gives. The recording has both, so the same pages with
      // their links taken out must come to the same listings - bar one. Coyote
      // Vs Acme's only page was for its 8 October screenings, gone from the
      // feed, and linked on to its 7 November one; nothing on the page names
      // that date, so the show keeps the feed's own details. (The venue now
      // writes a page for each run, as it later did for this one.)
      const withoutLinks = Object.fromEntries(
        Object.entries(eventPages).map(([url, html]) => {
          const $ = cheerio.load(html);
          $(".ticket-buttons").remove();
          return [url, $.html()];
        }),
      );
      expect(
        Object.values(withoutLinks).some((html) =>
          html.includes("ticket-buttons"),
        ),
      ).toBe(false);
      const byDate = sortAndFilterMovies(
        await transform(
          { movieListPage, eventFeeds, eventPages: withoutLinks },
          {},
        ),
      );
      const differing = byDate
        .filter(
          (movie, i) => JSON.stringify(movie) !== JSON.stringify(output[i]),
        )
        .map(({ title }) => title);
      expect(byDate.map(({ showingId }) => showingId)).toEqual(
        output.map(({ showingId }) => showingId),
      );
      expect(differing).toEqual(["COYOTE Vs ACME"]);
    },
    isRecording ? 240_000 : 30_000,
  );

  // A date is typed by hand, so one landing on a different film has to be
  // caught rather than give that film this page's details.
  it("refuses a page whose date falls on a different film", async () => {
    const movieListPage = `<venues><venue><shows>
      <show id="1"><name>WICKER</name><events>
        <event id="10"><date_time_iso>2026-12-10T19:30:00+00:00</date_time_iso></event>
      </events></show>
    </shows></venue></venues>`;
    const eventPage = `
      <h1 class="wp-block-post-title">Hairspray</h1>
      <div class="event-date"><p>Thursday 10 December</p><p>at</p><p>7:30pm</p></div>`;
    await expect(
      transform(
        {
          movieListPage,
          eventFeeds: {},
          eventPages: { "https://example.com/event/hairspray/": eventPage },
        },
        {},
      ),
    ).rejects.toThrow(
      'The page "Hairspray" (https://example.com/event/hairspray/) falls on a performance of "WICKER"',
    );
  });
});

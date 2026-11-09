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
const { parseEventPage } = require("../utils");

const isRecording = false;

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-11-09");

const titles = (movies) => movies.map(({ title }) => title).sort();

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-09"));

  it(
    "retrieve and transform",
    async () => {
      const { eventPages } = await retrieve();

      // Make sure the input looks roughly correct
      expect(Object.keys(eventPages)).toHaveLength(5);

      const output = sortAndFilterMovies(await transform({ eventPages }, {}));
      expect(
        output.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      expect(titles(data)).toEqual([
        "December's Secret Film Screening",
        "Festive Family Films - Dec 2026",
        "Parent and Baby Secret Film Screenings - Nov 2026",
        "Parent and Baby Secret Film Screenings: Festive Edition",
        "Secret Film Screenings - Nov",
      ]);

      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();

      // Sold out once every ticket type reads zero, as the page's own waitlist
      // switch decides it; a free event, with no tickets, never is
      const [url, html] = Object.entries(eventPages).find(([key]) =>
        key.endsWith("event_no=107883"),
      );
      expect(parseEventPage(html).isSoldOut).toBe(false);
      const soldOut = html.replace(
        /fpr-ticket-counter">\d+</g,
        'fpr-ticket-counter">0<',
      );
      expect(parseEventPage(soldOut).isSoldOut).toBe(true);
      const [movie] = await transform({ eventPages: { [url]: soldOut } }, {});
      expect(movie.performances[0].status).toEqual({ soldOut: true });
    },
    isRecording ? 240_000 : undefined,
  );
});

/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  sleep,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");
const {
  attributes: beehiveAttributes,
} = require("../../../cinemas/beehiven17.com");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
  sleep: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  // Retrieve paces its requests, which matters only against the live site, so
  // a replay doesn't wait. Timeouts stay real for the recording's sake, or the
  // pacing and fetch retries would wait on a clock that never moves.
  if (isRecording) {
    sleep.mockImplementation(jest.requireActual("../../../common/utils").sleep);
  }
  jest
    .useFakeTimers({ doNotFake: ["setTimeout"] })
    .setSystemTime(new Date("2026-10-04"));

  describe.each([
    {
      // Not in the council's venue directory, so the event carries only an
      // address, whose first line names the pub
      ...beehiveAttributes,
      expectedMatches: 2,
    },
    {
      // Linked from the event's "Venue" field
      name: "Hornsey Library",
      alternativeNames: [],
      address: "Haringey Park, Hornsey, London, N8 9JA, UK",
      geo: { lat: 51.578225283951, lon: -0.12205275199265 },
      expectedMatches: 4,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPages, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPages).toHaveLength(2);
        expect(Object.keys(moviePages)).toHaveLength(16);

        readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

        const cinema = { name, alternativeNames, address, geo };
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
        expect(schemaValidate(data)).toBe(true);
        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });

  it(
    "returns no events for unrelated cinema",
    async () => {
      const { movieListPages, moviePages } = await retrieve();

      readJSON.mockImplementation(() => ({ movieListPages, moviePages }));

      const unrelatedCinema = {
        name: "Some Other Cinema",
        alternativeNames: [],
        address: "1 Some Road, London, SE1 1AA, UK",
        geo: { lat: 51.5, lon: -0.1 },
      };
      expect(await findEvents(unrelatedCinema)).toHaveLength(0);

      // Libraries share their names with places elsewhere, so a same-named venue
      // on the other side of London must not pick up Hornsey Library's events
      const distantHornseyLibrary = {
        name: "Hornsey Library",
        alternativeNames: [],
        address: "1 Some Road, London, SE1 1AA, UK",
        geo: { lat: 51.5, lon: -0.1 },
      };
      expect(await findEvents(distantHornseyLibrary)).toHaveLength(0);
    },
    isRecording ? 600_000 : undefined,
  );

  // One retrieve shared across every check, as each live retrieve costs a
  // request per event page when recording
  it(
    "fails loudly when the page structure changes",
    async () => {
      const { moviePages } = await retrieve();
      const [url, html] = Object.entries(moviePages)[0];
      const cinema = { name: "Hornsey Library", alternativeNames: [] };

      const findEventsWithFirstPageEdited = (edit) => {
        readJSON.mockImplementation(() => ({
          moviePages: { ...moviePages, [url]: edit(html) },
        }));
        return findEvents(cinema);
      };

      await expect(
        findEventsWithFirstPageEdited((page) =>
          page.replaceAll("node--view-mode-full", "node--view-mode-gone"),
        ),
      ).rejects.toThrow(/Unable to find the event/);

      await expect(
        findEventsWithFirstPageEdited((page) =>
          page.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, "$1$2"),
        ),
      ).rejects.toThrow(/film title/);

      // The datetimes are London wall-clock times with a false "Z" appended. A
      // datetime in any other shape may be true UTC or carry an offset, and
      // reading it as wall-clock time would shift the screening.
      await expect(
        findEventsWithFirstPageEdited((page) =>
          page.replace(
            /datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z"/,
            'datetime="$1+01:00"',
          ),
        ),
      ).rejects.toThrow(/Unexpected event datetime/);

      await expect(
        findEventsWithFirstPageEdited((page) =>
          page
            .replaceAll("field--name-localgov-event-venue", "gone")
            .replaceAll("field--name-localgov-event-location", "gone"),
        ),
      ).rejects.toThrow(/Unable to extract a venue/);
    },
    isRecording ? 600_000 : undefined,
  );
});

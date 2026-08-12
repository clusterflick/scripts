/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-12"));

  describe.each([
    {
      name: "Peckhamplex",
      alternativeNames: [],
      address: "95a Rye Lane, Peckham, London, SE15 4ST, UK",
      geo: { lat: 51.47082093575928, lon: -0.0682754441408473 },
      expectedMatches: 2,
    },
    {
      name: "The Ivy House",
      alternativeNames: [],
      address: "40 Stuart Road, London, SE15 3BE, UK",
      geo: { lat: 51.458252131209605, lon: -0.052051494256446125 },
      expectedMatches: 2,
    },
    {
      // Geocoded coordinates are missing for this venue, so the match comes
      // from the postcode in the event's address instead.
      name: "The Feminist Library",
      alternativeNames: [],
      address:
        "Sojourner Truth Community Centre, 161 Sumner Road, London, SE15 6JL, UK",
      geo: { lat: 51.4779081654821, lon: -0.07327389439045094 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { festivalListPage, festivalPages, moviePages } =
          await retrieve();

        // Make sure the input looks roughly correct
        expect(festivalListPage).toBeTruthy();
        expect(festivalListPage).toContain("explore-title");
        expect(Object.keys(festivalPages)).toHaveLength(14);
        expect(Object.keys(moviePages)).toHaveLength(45);

        readJSON.mockImplementation(() => ({
          festivalListPage,
          festivalPages,
          moviePages,
        }));

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

  it("returns no events for unrelated cinema", async () => {
    const { festivalListPage, festivalPages, moviePages } = await retrieve();

    readJSON.mockImplementation(() => ({
      festivalListPage,
      festivalPages,
      moviePages,
    }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
      address: "1 Some Road, London, N1 1AA, UK",
      geo: { lat: 51.5387, lon: -0.0999 },
    };
    expect(await findEvents(unrelatedCinema)).toHaveLength(0);

    // Screenings happen in pubs, parks and community halls that share their
    // names with venues elsewhere in London. "Nunhead Cemetery" (SE15 3LW)
    // must not be picked up by a same-named venue on the other side of town.
    const distantNunheadCemetery = {
      name: "Nunhead Cemetery",
      alternativeNames: [],
      address: "1 Some Road, London, N1 1AA, UK",
      geo: { lat: 51.5387, lon: -0.0999 },
    };
    expect(await findEvents(distantNunheadCemetery)).toHaveLength(0);
  });

  describe("fails loudly when the page structure changes", () => {
    const cinema = { name: "Peckhamplex" };

    it("throws when a film title cannot be extracted", async () => {
      const { moviePages } = await retrieve();
      const [url, moviePage] = Object.entries(moviePages)[0];

      readJSON.mockImplementation(() => ({
        moviePages: {
          ...moviePages,
          [url]: {
            ...moviePage,
            html: moviePage.html.replace(
              /(<h1[^>]*tribe-events-single-event-title[^>]*>)[\s\S]*?(<\/h1>)/,
              "$1$2",
            ),
          },
        },
      }));

      await expect(findEvents(cinema)).rejects.toThrow(/film title/);
    });

    it("throws when schema.org event data is missing", async () => {
      const { moviePages } = await retrieve();
      const [url, moviePage] = Object.entries(moviePages)[0];

      readJSON.mockImplementation(() => ({
        moviePages: {
          ...moviePages,
          [url]: {
            ...moviePage,
            html: moviePage.html.replaceAll("application/ld+json", "text/none"),
          },
        },
      }));

      await expect(findEvents(cinema)).rejects.toThrow(/schema.org event data/);
    });

    it("throws when a venue name cannot be extracted", async () => {
      const { moviePages } = await retrieve();
      const [url, moviePage] = Object.entries(moviePages)[0];

      readJSON.mockImplementation(() => ({
        moviePages: {
          ...moviePages,
          [url]: {
            ...moviePage,
            html: moviePage.html.replaceAll("tribe-venue", "tribe-venue-gone"),
          },
        },
      }));

      await expect(findEvents(cinema)).rejects.toThrow(/venue name/);
    });
  });
});

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

// Hide script output
console.log = () => {};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-07-13"));

  describe.each([
    {
      name: "Phoenix Cinema",
      alternativeNames: [
        "Phoenix Cinema London",
        "Phoenix Cinema East Finchley",
        "Phoenix Cinema Finchley",
      ],
      address: "52 High Road, London, N2 9PJ, UK",
      geo: { lat: 51.58853061979289, lon: -0.16390063689779108 },
      expectedMatches: 1,
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPage, moviePages, venuePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPage).toBeTruthy();
        expect(movieListPage).toContain("Now Showing");
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(3);
        expect(Object.keys(venuePages)).toHaveLength(5);

        readJSON.mockImplementation(() => ({
          movieListPage,
          moviePages,
          venuePages,
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
    const { movieListPage, moviePages, venuePages } = await retrieve();

    readJSON.mockImplementation(() => ({
      movieListPage,
      moviePages,
      venuePages,
    }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    expect(await findEvents(unrelatedCinema)).toHaveLength(0);

    // "Showroom, Sheffield" (S1 2BX) shares a normalized name with the London
    // venue "The Showroom" (NW8 8PQ). Matching on the venue page's postcode
    // keeps them apart where a name-only match would wrongly collide them.
    const theShowroomLondon = {
      name: "The Showroom",
      alternativeNames: ["The Showroom Gallery"],
      address: "63 Penfold Street, London, NW8 8PQ, UK",
      geo: { lat: 51.52570188553431, lon: -0.17261733935585413 },
    };
    expect(await findEvents(theShowroomLondon)).toHaveLength(0);
  });

  describe("fails loudly when the page structure changes", () => {
    const cinema = { name: "Phoenix Cinema" };

    it("throws when a film title cannot be extracted", async () => {
      const { movieListPage, moviePages } = await retrieve();
      const [url, page] = Object.entries(moviePages)[0];
      const broken = {
        ...moviePages,
        [url]: page.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/g, "$1$2"),
      };

      readJSON.mockImplementation(() => ({
        movieListPage,
        moviePages: broken,
      }));

      await expect(findEvents(cinema)).rejects.toThrow(/film title/);
    });

    it("throws when a venue name cannot be extracted", async () => {
      const { movieListPage, moviePages } = await retrieve();
      const [url, page] = Object.entries(moviePages)[0];
      const broken = {
        ...moviePages,
        [url]: page.replace(/cinema_title/g, "cinema_removed"),
      };

      readJSON.mockImplementation(() => ({
        movieListPage,
        moviePages: broken,
      }));

      await expect(findEvents(cinema)).rejects.toThrow(/venue name/);
    });
  });
});

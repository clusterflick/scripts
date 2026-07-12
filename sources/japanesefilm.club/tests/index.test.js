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
  jest.useFakeTimers().setSystemTime(new Date("2026-07-12"));

  describe.each([
    {
      name: "Phoenix Cinema",
      alternativeNames: [
        "Phoenix Cinema London",
        "Phoenix Cinema East Finchley",
        "Phoenix Cinema Finchley",
      ],
      geo: { lat: 51.58853061979289, lon: -0.16390063689779108 },
      expectedMatches: 1,
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { movieListPage, moviePages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(movieListPage).toBeTruthy();
        expect(movieListPage).toContain("Now Showing");
        expect(moviePages).toBeTruthy();
        expect(Object.keys(moviePages)).toHaveLength(3);

        readJSON.mockImplementation(() => ({ movieListPage, moviePages }));

        const cinema = { name, alternativeNames, geo };
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
    const { movieListPage, moviePages } = await retrieve();

    readJSON.mockImplementation(() => ({ movieListPage, moviePages }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
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

/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, setupCacheMock } = require("../../../common/test-utils");
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

jest.mock("../../../common/cache");
setupCacheMock(__dirname, "2026-02-09");

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-02-09"));

  describe.each([
    {
      name: "BLOC Cinema",
      alternativeNames: ["BLOC"],
      address:
        "ArtsOne Building, Queen Mary University of London, 1 Westfield Way, London, E1 4PD, UK",
      geo: { lat: 51.52412543923962, lon: -0.03777143560976456 },
      expectedMatches: 2,
    },
    {
      name: "The Garden Cinema",
      alternativeNames: [],
      address: "39-41 Parker St, London WC2B 5PQ, UK",
      geo: { lat: 51.5162287, lon: -0.1213371 },
      expectedMatches: 1,
    },
    {
      name: "UCL East Community Cinema",
      alternativeNames: [],
      address: "One Pool Street, Stratford, London E20 2AF, UK",
      geo: { lat: 51.5382547, lon: -0.0098148 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const venues = await retrieve();

        // Make sure the input looks roughly correct
        expect(venues).toBeTruthy();
        expect(venues.queereast).toBeTruthy();
        expect(venues.queereast.movieListPage).toBeTruthy();
        expect(Object.keys(venues.queereast.moviePages)).toHaveLength(4);

        readJSON.mockImplementation(() => venues);

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
        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });

  it("returns no events for unrelated cinema", async () => {
    const venues = await retrieve();

    readJSON.mockImplementation(() => venues);

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
      address: "123 Fake Street, London, W1A 1AA, UK",
      geo: { lat: 51.0, lon: -0.1 },
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

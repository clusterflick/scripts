/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  silenceConsoleLog,
} = require("../../../common/test-utils");
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

silenceConsoleLog();

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-13"));

  describe.each([
    {
      // A screen hired by elevenfiftyfive, which the venue's own listings
      // never mention, and an Escapes screening the next week.
      name: "Genesis Cinema",
      address: "93-95 Mile End Road, Whitechapel, London, E1 4UJ, UK",
      geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
      expectedMatches: 2,
    },
    {
      // Escapes' standard and Relaxed Screenings are separate events, so two
      // showings of one film.
      name: "Lumiere Cinema Romford",
      alternativeNames: [
        "Lumiere Cinema",
        "Lumiere Romford",
        "Lumiere Romford Cinema",
        "Lumiere Cinema, Romford",
      ],
      address:
        "The Mercury Shopping Centre, Mercury Gardens, Romford, RM1 3EE, UK",
      geo: { lat: 51.57963148608159, lon: 0.18566149819018146 },
      expectedMatches: 2,
    },
    {
      // MASSIVE lists Marie Antoinette here, but only links out to the
      // cinema's own box office - which the venue's listings already carry.
      name: "Prince Charles Cinema",
      address: "7 Leicester Place, London, WC2H 7BY, UK",
      geo: { lat: 51.51149384362524, lon: -0.130186840699272 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { bookPages, eventPages } = await retrieve();

        // Make sure the input looks roughly correct
        expect(bookPages).toBeTruthy();
        expect(Object.keys(bookPages)).toHaveLength(122);
        expect(Object.keys(eventPages)).toHaveLength(5);

        readJSON.mockImplementation(() => ({ bookPages, eventPages }));

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
});

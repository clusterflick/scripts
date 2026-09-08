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
  jest.useFakeTimers().setSystemTime(new Date("2026-09-08"));

  describe.each([
    {
      name: "ODEON Luxe Leicester Square",
      address: "24-26 Leicester Square, London, WC2H 7JY, UK",
      geo: { lat: 51.51053736313127, lon: -0.12932277571696912 },
      expectedMatches: 60,
    },
    {
      name: "ODEON Luxe West End",
      address: "38 Leicester Square, London, WC2H 7DX, UK",
      geo: { lat: 51.509968860027634, lon: -0.13017680497804437 },
      expectedMatches: 45,
    },
    {
      // A third ODEON a two-minute walk away, to prove the festival's screens
      // are attributed by name rather than by being near Leicester Square
      name: "ODEON Luxe Haymarket",
      address: "11-18 Panton Street, London, SW1Y 4DP, UK",
      geo: { lat: 51.50977762735127, lon: -0.13114905789292086 },
      expectedMatches: 0,
    },
    {
      // A tenant that hangs no film record off its events, so every one of its
      // listings reaches us through the hasFilmRecords opt-out rather than the
      // usual pass filter
      name: "Stockwell Park Community Centre",
      alternativeNames: ["Stockwell Park Estate Community Centre"],
      address: "21 Aytoun Place, London, SW9 0TE, UK",
      geo: { lat: 51.469348, lon: -0.116817 },
      expectedMatches: 3,
    },
    {
      // Reached only by its alternative name: the programmer bills itself as
      // the venue, and the postcode on the event is what ties it to Kilburn
      name: "Metroland Studios",
      alternativeNames: ["Other Cinemas"],
      address: "91 Kilburn Square, London, NW6 6PS, UK",
      geo: { lat: 51.53867412862321, lon: -0.19566687295430385 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { tenantEvents } = await retrieve();

        // Make sure the input looks roughly correct
        expect(tenantEvents).toBeTruthy();
        expect(Object.keys(tenantEvents)).toHaveLength(2);
        expect(tenantEvents.frightfest2026).toHaveLength(115);
        expect(tenantEvents.bccwhenthestarsmeettheocean).toHaveLength(10);

        readJSON.mockImplementation(() => ({ tenantEvents }));

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

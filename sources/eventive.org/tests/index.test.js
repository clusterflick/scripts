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
    {
      // A tenant whose events carry no venue at all, matched through the venue
      // the tenant declares for them
      name: "Kingston Museum",
      address: "Wheatfield Way, Kingston upon Thames, London, KT1 2PS, UK",
      geo: { lat: 51.4096, lon: -0.3003 },
      expectedMatches: 3,
    },
    {
      // The festival bills each screen as part of the venue's name without the
      // " - " separator ("Phoenix Cinema Screen 1"), so this proves the name
      // still lands on the venue
      name: "Phoenix Cinema",
      alternativeNames: [
        "Phoenix Cinema London",
        "Phoenix Cinema East Finchley",
        "Phoenix Cinema Finchley",
      ],
      address: "52 High Road, London, N2 9PJ, UK",
      geo: { lat: 51.58853061979289, lon: -0.16390063689779108 },
      expectedMatches: 12,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { tenantEvents } = await retrieve();

        // Make sure the input looks roughly correct
        expect(tenantEvents).toBeTruthy();
        expect(Object.keys(tenantEvents)).toHaveLength(4);
        expect(tenantEvents.frightfest2026).toHaveLength(115);
        expect(tenantEvents.bccwhenthestarsmeettheocean).toHaveLength(11);
        expect(tenantEvents.kiffhalloween).toHaveLength(3);
        expect(tenantEvents.ukjewishfilmfestival2026).toHaveLength(78);

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

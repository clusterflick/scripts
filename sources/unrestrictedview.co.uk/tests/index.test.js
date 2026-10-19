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
  jest.useFakeTimers().setSystemTime(new Date("2026-10-19"));

  describe.each([
    {
      // The festival's home, listed by the site under its theatre's name.
      name: "The Hen & Chickens Theatre Bar",
      alternativeNames: ["The Hen & Chickens Theatre"],
      address: "109 St Paul's Road, London, N1 2NA, UK",
      geo: { lat: 51.54620937421457, lon: -0.10196631564320549 },
      expectedMatches: 13,
    },
    {
      name: "ODEON Luxe & Dine Islington",
      alternativeNames: [],
      address: "13 Esther Anne Place, Islington, London, N1 1TU, UK",
      geo: { lat: 51.538986888542766, lon: -0.10360688672760725 },
      expectedMatches: 2,
    },
    {
      name: "Everyman Screen on the Green",
      alternativeNames: [],
      address: "83 Upper Street, London, N1 0NP, UK",
      geo: { lat: 51.536895795317655, lon: -0.10367029831557663 },
      expectedMatches: 1,
    },
    {
      name: "ArtHouse Crouch End",
      alternativeNames: [],
      address: "159A Tottenham Lane, London, N8 9BT, UK",
      geo: { lat: 51.58192919065717, lon: -0.12008086198709847 },
      expectedMatches: 1,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events, performances, venues } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toHaveLength(39);
        expect(performances).toHaveLength(20);
        expect(venues).toHaveLength(7);

        readJSON.mockImplementation(() => ({ events, performances, venues }));

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
    const { events, performances, venues } = await retrieve();

    readJSON.mockImplementation(() => ({ events, performances, venues }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

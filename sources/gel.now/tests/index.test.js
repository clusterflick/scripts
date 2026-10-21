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

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-15"));

  describe.each([
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 1,
    },
    {
      // Runs a busy music programme alongside its screenings, so this covers
      // the film category filter holding: gigs at a matched venue stay out.
      name: "The Horse Hospital",
      address: "Colonnade, Bloomsbury, London, WC1N 1JD, UK",
      geo: { lat: 51.52278577182352, lon: -0.12441771517528585 },
      expectedMatches: 1,
    },
    {
      name: "Close-Up Film Centre",
      alternativeNames: ["Close-Up Cinema"],
      address: "97 Sclater Street, London, E1 6HR, UK",
      geo: { lat: 51.52363533860424, lon: -0.07204024586584808 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events, venues } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(venues).toBeTruthy();

        readJSON.mockImplementation(() => ({ events, venues }));

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

describe(`${attributes.name} start times`, () => {
  const cinema = {
    name: "The Cinema Museum",
    address: "2 Dugard Way, Renfrew Road, London, SE11 4TH, UK",
  };
  const findEventAt = async (startTime) => {
    readJSON.mockImplementation(() => ({
      events: [
        {
          id: 1110,
          name: "The Cinema Museum presents... Dyn Amo on 16mm",
          start_time: startTime,
          venues: [{ id: 1, name: "The Cinema Museum" }],
        },
      ],
      venues: [],
    }));
    const [event] = await findEvents(cinema);
    return new Date(event.performances[0].time);
  };

  // gel.now stamps the advertised London time with a "Z". Through BST that
  // reads an hour late if taken as UTC: Dyn Amo starts at 19:30 at the museum.
  it("reads a BST start time as London wall-clock time", async () => {
    expect((await findEventAt("2026-10-07T19:30:00Z")).toISOString()).toBe(
      "2026-10-07T18:30:00.000Z",
    );
  });

  it("reads a GMT start time as London wall-clock time", async () => {
    expect((await findEventAt("2026-11-04T19:30:00Z")).toISOString()).toBe(
      "2026-11-04T19:30:00.000Z",
    );
  });
});

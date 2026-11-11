/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
  schemaValidate,
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
        expect(schemaValidate(data)).toBe(true);
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

  // Markup from https://ti.to/queereast/girlfriends_uea_2026, whose organiser
  // typed a location rather than picking a venue
  describe("an event with a typed location and no venue record", () => {
    const html = `
      <h1 class="event-title">Girlfriends (University of East Anglia)</h1>
      <div class="tito-event-homepage--basic-info tito-event-homepage--basic-info-cal">
        <a href="https://checkout.tito.io/queereast/girlfriends_uea_2026?format=ics">
          6:30–8pm, November 18th, 2026
        </a>
      </div>
      <div class="tito-event-homepage--basic-info tito-event-homepage--basic-info-location">
        <a href="https://maps.google.com/maps?q=University+of+East+Anglia+">
          University of East Anglia
        </a>
      </div>
      <div class="tito-description markdown"><p>Join Queer East for a screening of Girlfriends (2025)</p></div>
      <div class="tito-links-section">
        <h4 class="tito-venues-heading">Links</h4>
        <ul class="tito-links"><li><a href="mailto:info@queereast.org.uk"><span>info@queereast.org.uk</span></a></li></ul>
      </div>`;
    const venues = {
      queereast: {
        moviePages: {
          "https://ti.to/queereast/girlfriends_uea_2026": html,
        },
      },
    };
    const geo = { lat: 51.5162287, lon: -0.1213371 };

    it("is matched to a cinema of that name", async () => {
      readJSON.mockImplementation(() => venues);

      const output = await findEvents({
        name: "University of East Anglia",
        alternativeNames: [],
        address: "39-41 Parker St, London WC2B 5PQ, UK",
        geo,
      });

      expect(output).toHaveLength(1);
      expect(output[0].title).toBe("Girlfriends (University of East Anglia)");
      expect(output[0].performances).toHaveLength(1);
      expect(output[0].performances[0].time).toBe(
        new Date("2026-11-18T18:30:00Z").getTime(),
      );
    });

    it("is not matched to any other cinema", async () => {
      readJSON.mockImplementation(() => venues);

      const output = await findEvents({
        name: "The Garden Cinema",
        alternativeNames: [],
        address: "39-41 Parker St, London WC2B 5PQ, UK",
        geo,
      });

      expect(output).toHaveLength(0);
    });
  });

  // Markup from https://ti.to/queereast/girlfriends_uok_2026, which gives a
  // date and no time
  describe("an event with a date and no time", () => {
    const html = `
      <h1 class="event-title">Girlfriends (University of Kent)</h1>
      <div class="tito-event-homepage--basic-info tito-event-homepage--basic-info-cal">
        <a href="https://checkout.tito.io/queereast/girlfriends_uok_2026?format=ics">
          November 16th, 2026
        </a>
      </div>
      <div class="tito-event-homepage--basic-info tito-event-homepage--basic-info-location">
        <a href="https://maps.google.com/maps?q=51.2967395%2C1.0630042+%28Lupino+Cinema+at+the+University+of+Kent%2C+Grimond+Building%2C+University+of+Kent%2C+Canterbury%2C+CT2+7NG%29">
          Lupino Cinema at the University of Kent
        </a>
      </div>
      <ul class="tito-venues"><li><a href="#"><span>
        Lupino Cinema at the University of Kent, Grimond Building, University of Kent, Canterbury, CT2 7NG
      </span></a></li></ul>`;
    const venues = {
      queereast: {
        moviePages: {
          "https://ti.to/queereast/girlfriends_uok_2026": html,
        },
      },
    };

    it("is passed over for a cinema it isn't at", async () => {
      readJSON.mockImplementation(() => venues);

      const output = await findEvents({
        name: "The Garden Cinema",
        alternativeNames: [],
        address: "39-41 Parker St, London WC2B 5PQ, UK",
        geo: { lat: 51.5162287, lon: -0.1213371 },
      });

      expect(output).toHaveLength(0);
    });

    it("throws for the cinema it is at", async () => {
      readJSON.mockImplementation(() => venues);

      await expect(
        findEvents({
          name: "Lupino Cinema at the University of Kent",
          alternativeNames: [],
          address: "Grimond Building, University of Kent, Canterbury, CT2 7NG",
          geo: { lat: 51.2967395, lon: 1.0630042 },
        }),
      ).rejects.toThrow(
        'Expected en-dash in calendar text: "November 16th, 2026"',
      );
    });
  });
});

const { format } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const { readJSON } = require("../../../common/utils");
const findEvents = require("../find-events");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// art'otel Battersea's Halloween pop up, as retrieved on 17th September 2026.
// It postdates the HAR recordings, and its 29th October screening is sold under
// two ticket types that spell the film differently - the chair separating the
// film from the dinner with a hyphen, the sofa with a double space - which is
// what made the venue's transform fail on a duplicate showing id.
const data = require("./fixtures/artotel-battersea.json");

// art'otel Hoxton's Kids Halloween Movie Screening, as retrieved on 12th
// October 2026. Each screening is a ticket type named only for its date, with
// the film in the ticket's description, and every occurrence carries all of
// them - so the dates were being listed as films, each at every occurrence.
const hoxtonData = require("./fixtures/artotel-hoxton.json");

// As held in cinemas/artotel.com-battersea-power-station/attributes.js -
// DesignMyNight lists the venue under the restaurant's name
const cinema = {
  name: "JOIA",
  address: "1 Electric Boulevard, Nine Elms, London, SW11 8BJ, UK",
  geo: { lat: 51.480696871163154, lon: -0.14555423787954186 },
};

describe("findEvents", () => {
  it("gives one event to a screening whose ticket types spell the film differently", async () => {
    readJSON.mockImplementation(() => data);

    const events = await findEvents(cinema);

    expect(events.map(({ title }) => title)).toEqual([
      "Edward Scissorhands (29th October) - Dinner in TOZI Pizzeria & Cicchetti Bar",
      "Ghostbusters",
      "The Rocky Horror Picture Show",
    ]);

    const showingIds = events.map(({ showingId }) => showingId);
    expect(new Set(showingIds).size).toBe(showingIds.length);

    // The two ticket types are one screening, not one each
    const [edwardScissorhands] = events;
    expect(edwardScissorhands.performances).toHaveLength(1);
  });

  it("takes a ticket named only for its date as one screening of the film it describes", async () => {
    readJSON.mockImplementation(() => hoxtonData);

    // As held in cinemas/artotel.com-hoxton/attributes.js
    const events = await findEvents({
      name: "Art'otel London Hoxton",
      address: "1-3 Rivington Street, London, EC2A 3DT, UK",
      geo: { lat: 51.526156790963746, lon: -0.08333842748307863 },
    });

    const screenings = Object.fromEntries(
      events.map(({ title, performances }) => [
        title,
        performances.map(({ time }) =>
          format(time, "yyyy-MM-dd HH:mm", { locale: enGB }),
        ),
      ]),
    );
    expect(screenings).toEqual({
      "The Nightmare Before Christmas": [
        "2026-10-24 16:00",
        "2026-10-27 18:30",
        "2026-10-31 16:00",
        "2026-11-01 18:30",
      ],
      Maleficent: ["2026-10-24 18:30", "2026-11-01 11:00"],
      "The Book of Life": [
        "2026-10-25 11:00",
        "2026-10-30 11:00",
        "2026-11-01 13:30",
      ],
      Frankenweenie: [
        "2026-10-25 13:30",
        "2026-10-27 11:00",
        "2026-10-28 18:30",
      ],
      Coco: [
        "2026-10-27 13:30",
        "2026-10-28 11:00",
        "2026-10-31 11:00",
        "2026-11-01 16:00",
      ],
      "Hocus Pocus 2": ["2026-10-27 16:00", "2026-10-31 18:30"],
      "Hocus Pocus": ["2026-10-31 13:30"],
    });

    const showingIds = events.map(({ showingId }) => showingId);
    expect(new Set(showingIds).size).toBe(showingIds.length);
  });
});

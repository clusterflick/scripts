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
});

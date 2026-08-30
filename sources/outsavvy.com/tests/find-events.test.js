const fs = require("node:fs");
const path = require("node:path");
const { readJSON } = require("../../../common/utils");
const findEvents = require("../find-events");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// An event billed "at various times" only appeared on the site after the HAR
// files were recorded, and re-recording them would replace every event in the
// snapshot to add this one page. The captured page is read directly instead.
const url =
  "https://outsavvy.com/event/39169/canal-film-club-x-fringe-queer-film-fest-closing-night-shorts-life-on-the-margins";
const page = fs.readFileSync(
  path.join(__dirname, "fixtures", "various-times.html"),
  "utf8",
);

// As held in cinemas/instagram.com-canalfilmclub/attributes.js - the event is
// listed under the venue's alternative name rather than the name we call it by
const cinema = {
  name: "Canal Film Club",
  alternativeNames: [
    "East London Canal (Location released to ticket holders 48hrs before each event)",
    "East London Canal",
  ],
  address: "East London Canal, Hackney, London, E5 9RH, UK",
  geo: { lat: 51.56312474391641, lon: -0.043491730782087026 },
};

describe("findEvents", () => {
  it("takes the start time from the booking widget when the header has none", async () => {
    readJSON.mockImplementation(() => ({ moviePages: { [url]: page } }));

    const events = await findEvents(cinema);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe(
      "Canal Film Club X Fringe! Queer Film Fest Closing Night Shorts: Life On The Margins",
    );
    expect(events[0].performances).toHaveLength(1);
    expect(events[0].performances[0].time).toBe(
      new Date("2026-09-19T19:00:00Z").getTime(),
    );
  });

  it("fails at the venue the undateable event is listed at", async () => {
    const withoutWidget = page.replace(/var jsonDates\s*=\s*\[.*\]/, "");
    readJSON.mockImplementation(() => ({
      moviePages: { [url]: withoutWidget },
    }));

    await expect(findEvents(cinema)).rejects.toThrow(
      `No date could be read for ${url}`,
    );
  });

  it("leaves other venues alone when an event can't be dated", async () => {
    const withoutWidget = page.replace(/var jsonDates\s*=\s*\[.*\]/, "");
    readJSON.mockImplementation(() => ({
      moviePages: { [url]: withoutWidget },
    }));

    await expect(
      findEvents({
        name: "Hackney Picturehouse",
        geo: { lat: 51.54474966715274, lon: -0.055025638908993514 },
      }),
    ).resolves.toEqual([]);
  });
});

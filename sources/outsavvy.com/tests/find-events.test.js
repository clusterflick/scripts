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

// Folklore's first event postdates the recordings too, and is read the same way
const folkloreUrl =
  "https://outsavvy.com/event/39708/interactive-b-movie-cabaret-night-american-rickshaw";
const folklorePage = fs.readFileSync(
  path.join(__dirname, "fixtures", "folklore.html"),
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
  geoRadius: 3,
};

// As held in cinemas/folklorehoxton.co.uk/attributes.js - OutSavvy writes the
// venue as plain "Folklore", which is the name we hold it under
const folklore = {
  name: "Folklore",
  alternativeNames: ["Folklore Hoxton", "Falkor"],
  address: "186 Hackney Road, London, E2 7QL, UK",
  geo: { lat: 51.53071724137933, lon: -0.07234497283238506 },
};

// An event whose description opens on the credit for the film club behind it
const creditUrl =
  "https://outsavvy.com/event/39044/camp-classics-presents-starrbooty-at-the-divine";
const creditPage = fs.readFileSync(
  path.join(__dirname, "fixtures", "presenter-credit.html"),
  "utf8",
);

// As held in cinemas/thedivine.co.uk/attributes.js
const divine = {
  name: "The Divine",
  address: "33-35 Stoke Newington Road, London, N16 8BJ, UK",
  geo: { lat: 51.55190978261229, lon: -0.07543040185169653 },
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

  it("notes the film club an event is presented by", async () => {
    readJSON.mockImplementation(() => ({
      moviePages: { [creditUrl]: creditPage },
    }));

    const events = await findEvents(divine);

    expect(events).toHaveLength(1);
    expect(events[0].performances[0].notes).toBe("Presented by CAMP CLASSICS");
  });

  // A venue promoting its own night tells a reader nothing by repeating itself
  it("leaves out a credit naming the venue itself", async () => {
    readJSON.mockImplementation(() => ({
      moviePages: { [creditUrl]: creditPage },
    }));

    const events = await findEvents({
      ...divine,
      alternativeNames: ["CAMP CLASSICS"],
    });

    expect(events).toHaveLength(1);
    expect(events[0].performances[0].notes).toBe("");
  });

  // OutSavvy is UK-wide, so a name we hold is not ours wherever it turns up -
  // the sweep carries the Brighton Duke of York's
  it("rejects a venue matching by name but sitting somewhere else", async () => {
    readJSON.mockImplementation(() => ({
      moviePages: { [folkloreUrl]: folklorePage },
    }));

    const elsewhere = {
      ...folklore,
      address: "1 Preston Road, Brighton, BN1 4NA, UK",
      geo: { lat: 50.8348, lon: -0.1406 },
    };

    await expect(findEvents(elsewhere)).resolves.toEqual([]);
  });

  it("matches Folklore by the name OutSavvy lists it under", async () => {
    readJSON.mockImplementation(() => ({
      moviePages: { [folkloreUrl]: folklorePage },
    }));

    const events = await findEvents(folklore);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe(
      "Interactive B-Movie & Cabaret Night: American Rickshaw!",
    );
    expect(events[0].performances).toHaveLength(1);
    expect(events[0].performances[0].time).toBe(
      new Date("2026-10-13T18:00:00Z").getTime(),
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

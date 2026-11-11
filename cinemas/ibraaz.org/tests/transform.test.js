const transform = require("../transform");

// Turang's film page, cut down to what the transform reads, in Ibraaz's own
// words from a November 2026 retrieve.
const TURANG_URL = "https://ibraaz.org/whats-on/turang";
const turangPage = `
  <div class="hero__inner">
    <h1 class="headline">Turang</h1>
    <p class="line--lg">Bachtiar Siagian</p>
  </div>
  <div class="richtext">
    <p>With an introduction from <strong>Bunga Siagian</strong>, cultural producer, researcher, and daughter of Bachtiar Siagian, the screening presents the restored film as an act of narrative reclamation and an archive of decolonisation, created at a time of radical political upheaval in the country of its creation. This screening of <i>Turang</i> is curated by <strong>May Adadol Ingawanij</strong> with Ibraaz in conversation with the final chapter of Taring Padi’s <i>Rakyat Pasti Menang</i> at Ibraaz London, which runs until 22 November, 2026.</p>
  </div>
  <div class="tt-widget-fallback">
    <a href="https://tickets.ibraaz.org/events/ibraaz/2526567/select-date">Book</a>
  </div>
`;

// The Ticket Tailor event says nothing of the introduction.
const sourcedEvents = {
  "tickettailor.com": [
    {
      showingId: "tickettailor.com-2526567",
      title: "Turang",
      url: "https://www.tickettailor.com/events/ibraaz/2526567",
      overview: {
        duration: 7200000,
        categories: [],
        directors: [],
        actors: [],
      },
      performances: [
        {
          time: new Date("2026-11-22T15:00:00Z").getTime(),
          notes: "",
          bookingUrl: "https://www.tickettailor.com/events/ibraaz/2526567",
          status: {},
          accessibility: {},
          format: {},
          occasions: {},
        },
      ],
      matchingHints: { overview: "Turang" },
    },
  ],
};

describe("Ibraaz transform", () => {
  it("reads the occasions the film page describes", async () => {
    const [movie] = await transform(
      { moviePages: { [TURANG_URL]: turangPage } },
      sourcedEvents,
    );

    expect(movie.performances[0].occasions).toEqual({
      intro: { guests: ["Bunga Siagian"] },
    });
  });

  it("keeps the occasions the listing found", async () => {
    const listed = structuredClone(sourcedEvents);
    listed["tickettailor.com"][0].performances[0].occasions = { qAndA: true };

    const [movie] = await transform(
      { moviePages: { [TURANG_URL]: turangPage } },
      listed,
    );

    expect(movie.performances[0].occasions).toEqual({
      intro: { guests: ["Bunga Siagian"] },
      qAndA: true,
    });
  });
});

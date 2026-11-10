const transform = require("../transform");

const card = (slug, title, date, time) =>
  `<div class="project-post">
    <a class="project-link" href="https://irishculturalcentre.co.uk/event/${slug}/"></a>
    <div class="project-bottom">
      <h3>${title}</h3>
      <div><p>Description</p></div><br>
      <p><strong>${date}</strong></p>
      <p>${time}</p>
    </div>
  </div>`;

const listing = (...cards) =>
  `<div class="search-filter-results">${cards.join("")}</div>`;

const eventPage =
  '<div><h1>Title</h1><p>Description</p><a class="back-link">Back</a></div>';

// As the listing was served from 9th November 2026, every date and time blank.
const undatedCard = card(
  "trojan-eddie-film-screening",
  "Trojan Eddie Film Screening and Q&amp;A",
  " ",
  "",
);

describe("transform of a listing missing its dates", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips an undated card and keeps the dated ones", async () => {
    const movies = await transform(
      {
        movieListPage: listing(
          undatedCard,
          card(
            "baite-london-premier-screening",
            "Báite",
            "Fri 11 December 2026",
            "Doors: 7.30pm; Starts: 8pm",
          ),
        ),
        eventPages: {
          "https://irishculturalcentre.co.uk/event/baite-london-premier-screening/":
            eventPage,
        },
      },
      {},
    );
    expect(movies.map(({ title }) => title)).toEqual(["Báite"]);
    expect(console.log).toHaveBeenCalledWith(
      " - Skipped (no date on the listing): Trojan Eddie Film Screening and Q&A https://irishculturalcentre.co.uk/event/trojan-eddie-film-screening/",
    );
  });

  // Recovery carries the events forward from the previous release, so a
  // listing with every date gone is not a reason to fail the venue.
  it("returns nothing rather than failing when every card is undated", async () => {
    await expect(
      transform({ movieListPage: listing(undatedCard), eventPages: {} }, {}),
    ).resolves.toEqual([]);
  });

  it("still fails on a listing with no cards at all", async () => {
    await expect(
      transform({ movieListPage: listing(), eventPages: {} }, {}),
    ).rejects.toThrow("No movies found");
  });
});

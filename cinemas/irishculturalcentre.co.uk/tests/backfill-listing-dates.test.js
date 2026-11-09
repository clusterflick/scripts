const cheerio = require("cheerio");
const { getUndatedEvents, backfillListingDates } = require("../utils");

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

const readCards = (html) => {
  const $ = cheerio.load(html);
  return $(".project-post")
    .map((_, post) => {
      const details = $(post).find(".project-bottom > p");
      return [
        [
          $(post).find("h3").text(),
          details.eq(0).text().trim(),
          details.eq(1).text().trim(),
        ],
      ];
    })
    .get();
};

// As the film listing was served on 9th November 2026, against the cached
// What's On page that still carried the dates.
const brokenListing = listing(
  card("trojan-eddie-film-screening", "Trojan Eddie", " ", ""),
  card("baite-london-premier-screening", "Báite", " ", ""),
);
const fullListing = listing(
  card("peter-flanagan", "Peter Flanagan", "Fri 13 November 2026", "8pm"),
  card(
    "trojan-eddie-film-screening",
    "Trojan Eddie",
    "Sat 05 December 2026",
    "Doors: 7.30pm; Starts: 8pm",
  ),
  card(
    "baite-london-premier-screening",
    "Báite",
    "Fri 11 December 2026",
    "Doors: 7.30pm; Starts: 8pm",
  ),
);

describe("getUndatedEvents", () => {
  it("names the cards with a blank date", () => {
    expect(
      getUndatedEvents(
        listing(
          card("a", "Dated", "Thu 12 November 2026", "Starts: 7pm"),
          card("b", "Undated", " ", ""),
        ),
      ),
    ).toEqual(["Undated"]);
  });

  it("finds none on a listing with nothing on", () => {
    expect(getUndatedEvents(listing())).toEqual([]);
  });
});

describe("backfillListingDates", () => {
  it("dates each card from the full listing's card for the same event", () => {
    expect(readCards(backfillListingDates(brokenListing, fullListing))).toEqual(
      [
        ["Trojan Eddie", "Sat 05 December 2026", "Doors: 7.30pm; Starts: 8pm"],
        ["Báite", "Fri 11 December 2026", "Doors: 7.30pm; Starts: 8pm"],
      ],
    );
  });

  it("adds nothing the film listing doesn't list", () => {
    expect(
      readCards(backfillListingDates(brokenListing, fullListing)),
    ).toHaveLength(2);
  });

  it("leaves a card that already has a date as it is", () => {
    const partlyBroken = listing(
      card(
        "trojan-eddie-film-screening",
        "Trojan Eddie",
        "Sun 06 December 2026",
        "Starts: 3pm",
      ),
      card("baite-london-premier-screening", "Báite", " ", ""),
    );
    expect(readCards(backfillListingDates(partlyBroken, fullListing))).toEqual([
      ["Trojan Eddie", "Sun 06 December 2026", "Starts: 3pm"],
      ["Báite", "Fri 11 December 2026", "Doors: 7.30pm; Starts: 8pm"],
    ]);
  });

  it("fails when the full listing can't date a card either", () => {
    const fullWithoutBaite = listing(
      card(
        "trojan-eddie-film-screening",
        "Trojan Eddie",
        "Sat 05 December 2026",
        "Doors: 7.30pm; Starts: 8pm",
      ),
      card("baite-london-premier-screening", "Báite", " ", ""),
    );
    expect(() => backfillListingDates(brokenListing, fullWithoutBaite)).toThrow(
      "Listing has 1 event(s) with no date, and the full listing doesn't date them either: Báite",
    );
  });
});

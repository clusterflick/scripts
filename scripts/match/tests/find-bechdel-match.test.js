const fs = require("node:fs");
const path = require("node:path");
const { parseYearPage, getYearPageUrls } = require("../find-bechdel-match");

const listing = fs.readFileSync(
  path.join(__dirname, "fixtures", "bechdel-year-listing.html"),
  "utf8",
);

const A_PRIVATE_LIFE = {
  id: 12100,
  imdbId: "tt33852162",
  url: "https://bechdeltest.com/view/12100/a_private_life/",
};
const THE_ACCOUNTANT_2 = {
  id: 11977,
  imdbId: "tt7068946",
  url: "https://bechdeltest.com/view/11977/the_accountant_2/",
};
const ANNIVERSARY = {
  id: 12078,
  imdbId: "tt12583926",
  url: "https://bechdeltest.com/view/12078/anniversary/",
};
const THE_ASTRONAUT = {
  id: 12221,
  imdbId: "tt13964560",
  url: "https://bechdeltest.com/view/12221/the_astronaut/",
};

describe("parseYearPage", () => {
  it("pairs each listing entry with its IMDB id and slugged URL", () => {
    expect(parseYearPage(listing)).toEqual([
      {
        id: 11663,
        imdbId: "tt3566834",
        // The slug is kept from the listing rather than rebuilt: /view/11663/
        // only serves a meta-refresh to this URL.
        url: "https://bechdeltest.com/view/11663/a_minecraft_movie/",
      },
      A_PRIVATE_LIFE,
      THE_ACCOUNTANT_2,
      ANNIVERSARY,
      THE_ASTRONAUT,
    ]);
  });

  it("skips entries which have no IMDB link to join on", () => {
    const withoutImdbLink = listing.replace(
      /<a href="https:\/\/www\.imdb\.com\/title\/tt3566834\/">.*?<\/a>/s,
      "",
    );
    expect(parseYearPage(withoutImdbLink)).toEqual([
      A_PRIVATE_LIFE,
      THE_ACCOUNTANT_2,
      ANNIVERSARY,
      THE_ASTRONAUT,
    ]);
  });

  it("returns nothing when the listing markup no longer matches", () => {
    expect(
      parseYearPage("<div class='list'><p>Nothing here</p></div>"),
    ).toEqual([]);
  });
});

describe("getYearPageUrls", () => {
  const entriesFor = (year, count) =>
    Array.from({ length: count }, () => ({ year }));

  it("requests a single page for a year within the page size", () => {
    expect(getYearPageUrls(entriesFor(2025, 123))).toEqual([
      "https://bechdeltest.com/year/2025/",
    ]);
  });

  it("paginates years which hold more than a page of entries", () => {
    // 422 entries across 200-entry pages: the year page plus two more.
    expect(getYearPageUrls(entriesFor(2013, 422))).toEqual([
      "https://bechdeltest.com/year/2013/",
      "https://bechdeltest.com/year/2013/page/1/",
      "https://bechdeltest.com/year/2013/page/2/",
    ]);
  });

  it("covers every year present in the index, oldest first", () => {
    expect(
      getYearPageUrls([
        ...entriesFor(2025, 1),
        ...entriesFor(1936, 1),
        ...entriesFor(1974, 1),
      ]),
    ).toEqual([
      "https://bechdeltest.com/year/1936/",
      "https://bechdeltest.com/year/1974/",
      "https://bechdeltest.com/year/2025/",
    ]);
  });
});

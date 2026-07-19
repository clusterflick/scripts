const transform = require("../transform");

const attributes = {
  id: "bfi.org.uk-test",
  name: "BFI Test",
  domain: "https://whatson.bfi.org.uk/Online/",
};

const ARTICLE_ID = "3FE27F41-4293-4033-8957-B4FB08A79DA4";
const showPath = `default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${ARTICLE_ID}`;

const filmPage = `<html><body>
    <div class="main-article-body"><div class="Rich-text">A film.</div></div>
    <ul class="Film-info__information"></ul>
  </body></html>`;

// A trimmed `searchNames` map with the columns transform reads. Rows are built
// positionally against it, mirroring how BFI names its `searchResults` fields.
const SEARCH_NAMES = [
  "start_date",
  "venue_description",
  "availability_num",
  "keywords",
];
const makeRow = ({ startDate, screen, availabilityNum, keywords = "" }) => {
  const row = [];
  row[SEARCH_NAMES.indexOf("start_date")] = startDate;
  row[SEARCH_NAMES.indexOf("venue_description")] = screen;
  row[SEARCH_NAMES.indexOf("availability_num")] = availabilityNum;
  row[SEARCH_NAMES.indexOf("keywords")] = keywords;
  return row;
};

// Retrieve now hands transform the whole `articleContext`; a `searchResults` of
// `undefined` models an article with no performances.
const runTransform = async (rows) => {
  const articleContext = { searchNames: SEARCH_NAMES };
  if (rows) articleContext.searchResults = rows.map(makeRow);
  const moviePages = {
    [showPath]: { title: "Test Film", html: filmPage, articleContext },
  };
  const shows = await transform(attributes, { moviePages }, {});
  return shows[0].performances;
};

const P1 = {
  startDate: "Saturday 11 July 2026 20:35",
  screen: "NFT4",
  availabilityNum: "5",
};
const P2 = {
  startDate: "Tuesday 14 July 2026 20:45",
  screen: "NFT4",
  availabilityNum: "0",
};

describe("BFI transform", () => {
  it("builds a performance from each searchResults row", async () => {
    const performances = await runTransform([P1, P2]);

    expect(performances).toHaveLength(2);

    const p1 = performances.find(
      (performance) =>
        performance.time === new Date("2026-07-11T20:35").getTime(),
    );
    expect(p1).toBeTruthy();
    // getScreen normalises "NFT4" down to its screen number.
    expect(p1.screen).toBe("4");
    expect(p1.status).toEqual({ soldOut: false });

    const p2 = performances.find(
      (performance) =>
        performance.time === new Date("2026-07-14T20:45").getTime(),
    );
    expect(p2).toBeTruthy();
    // availability_num of 0 (sold out) and -1 (error) both mark unbookable.
    expect(p2.status).toEqual({ soldOut: true });
  });

  it("keeps only the screen name from a venue with a location suffix", async () => {
    const performances = await runTransform([
      { ...P1, screen: "BFI IMAX, Waterloo" },
    ]);
    expect(performances[0].screen).toBe("BFI IMAX");
  });

  it("reads accessibility from each performance's keywords", async () => {
    const [withAccess, without] = await runTransform([
      { ...P1, keywords: "Releases,Audio description,Digital,Closed captions" },
      { ...P2, keywords: "Releases,Digital" },
    ]);
    // Per-performance: the second screening doesn't inherit the first's tags.
    expect(withAccess.accessibility).toEqual({
      audioDescription: true,
      hardOfHearing: true,
    });
    expect(without.accessibility).toEqual({});
  });

  it("treats descriptive subtitles as hard-of-hearing, not a language subtitle", async () => {
    const [performance] = await runTransform([
      { ...P1, keywords: "Descriptive subtitles (open captions),Digital" },
    ]);
    expect(performance.accessibility).toEqual({ hardOfHearing: true });
  });

  it("reads format from each performance's keywords", async () => {
    const [seventyMm, digital] = await runTransform([
      { ...P1, keywords: "IMAX 70mm" },
      { ...P2, keywords: "Digital,Releases" },
    ]);
    expect(seventyMm.format).toEqual({ presentation: "imax", source: "70mm" });
    expect(digital.format).toEqual({});
  });

  it("de-duplicates performances at the same time in the same screen", async () => {
    const performances = await runTransform([P1, { ...P1 }]);
    expect(performances).toHaveLength(1);
  });

  it("emits no performances for an article with no searchResults", async () => {
    const performances = await runTransform(null);
    expect(performances).toHaveLength(0);
  });
});

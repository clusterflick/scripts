const transform = require("../transform");

const attributes = {
  id: "bfi.org.uk-test",
  name: "BFI Test",
  domain: "https://whatson.bfi.org.uk/Online/",
};

const ARTICLE_ID = "3FE27F41-4293-4033-8957-B4FB08A79DA4";
const showPath = `default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${ARTICLE_ID}`;

// A searchResults row is a positional array; fill the fields transform reads.
const makeRow = ({ contextId, date, screen, hasLink }) => {
  const row = new Array(65).fill("");
  row[0] = contextId;
  row[5] = "Test Film";
  row[6] = "Test Film";
  row[7] = date;
  row[18] = hasLink
    ? `default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${ARTICLE_ID}&BOparam::WScontent::loadArticle::context_id=${contextId}`
    : "";
  row[64] = screen;
  return row;
};

const makeFilmPage = (searchResults) =>
  `<html><body>
    <div class="main-article-body"><div class="Rich-text">A film.</div></div>
    <ul class="Film-info__information"></ul>
    <script>var d = { searchResults : ${JSON.stringify(
      searchResults,
    )} , searchFilters : [] };</script>
  </body></html>`;

// A calendar `.result-box-item` for a performance that *does* have a link.
const makeCalendarPerformance = ({ contextId, date, screen }) =>
  `<div class="item-name"><a class="more-info" href="default.asp?doWork::WScontent::loadArticle=Load&BOparam::WScontent::loadArticle::article_id=${ARTICLE_ID}&BOparam::WScontent::loadArticle::context_id=${contextId}">Test Film</a></div>
   <div class="item-start-date"><span class="start-date">${date}</span></div>
   <div class="item-venue">${screen}</div>
   <div class="item-link"></div>`;

const P1 = {
  contextId: "AAAA-1111",
  date: "Saturday 11 July 2026 20:35",
  screen: "NFT4",
};
const P2 = {
  contextId: "BBBB-2222",
  date: "Tuesday 14 July 2026 20:45",
  screen: "NFT4",
};

const runTransform = async ({ calendarPerformances, searchResultRows }) => {
  const moviePages = {
    [showPath]: {
      title: "Test Film",
      html: makeFilmPage(searchResultRows),
      performances: calendarPerformances.map(makeCalendarPerformance),
    },
  };
  const shows = await transform(attributes, { moviePages }, {});
  return shows[0].performances;
};

describe("BFI transform searchResults recovery", () => {
  it("recovers a performance missing from the calendar but present in searchResults", async () => {
    const performances = await runTransform({
      calendarPerformances: [P1],
      searchResultRows: [
        makeRow({ ...P1, hasLink: true }),
        makeRow({ ...P2, hasLink: false }),
      ],
    });

    expect(performances).toHaveLength(2);
    const recovered = performances.find(
      (performance) =>
        performance.time === new Date("2026-07-14T20:45").getTime(),
    );
    expect(recovered).toBeTruthy();
    // Normalised the same way a calendar-derived performance would be.
    const calendarP1 = performances.find(
      (performance) =>
        performance.time === new Date("2026-07-11T20:35").getTime(),
    );
    expect(recovered.screen).toBe(calendarP1.screen);
    expect(recovered.status).toEqual({ soldOut: false });
  });

  it("does not duplicate performances already present in the calendar", async () => {
    const performances = await runTransform({
      calendarPerformances: [P1, P2],
      searchResultRows: [
        makeRow({ ...P1, hasLink: true }),
        makeRow({ ...P2, hasLink: true }),
      ],
    });

    expect(performances).toHaveLength(2);
  });

  it("leaves the calendar untouched when there is no searchResults array", async () => {
    const moviePages = {
      [showPath]: {
        title: "Test Film",
        html: '<html><body><div class="main-article-body"></div></body></html>',
        performances: [makeCalendarPerformance(P1)],
      },
    };
    const shows = await transform(attributes, { moviePages }, {});
    expect(shows[0].performances).toHaveLength(1);
  });
});

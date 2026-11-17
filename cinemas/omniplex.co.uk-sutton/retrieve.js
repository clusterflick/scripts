const cheerio = require("cheerio");
const { fetchWin1252Text } = require("../../common/utils");
const {
  extractAllowedDates,
  findMovieCards,
  getMovieCardTitleLink,
  getMoviePageUrl,
  isSiteChooser,
} = require("../../common/omniplex.co.uk/utils");
const { domain, cinemaId, siteCode } = require("./attributes");

async function retrieve() {
  const indexPage = await fetchWin1252Text(
    `${domain}/cinema/showtimes/${cinemaId}`,
  );
  const dates = extractAllowedDates(indexPage);

  const datePages = {};
  for (const date of dates) {
    const url = `${domain}/cinema/showtimes/${cinemaId}?action=processFilters&filterDate=${date}`;
    datePages[date] = await fetchWin1252Text(url);
  }

  // The showtimes pages give a film's title, runtime, certificate and synopsis
  // but never its director or cast, which is what the matcher checks a title
  // against. Without them a title shared by several films - there are nine
  // called "The Odyssey", two from 2026 - can only be settled by a model, when
  // Christopher Nolan's name settles it in code. So each film's own page is
  // fetched once, from the title link of every card the transform will read,
  // found the way the transform finds them.
  //
  // Whatever shape those links take, then, the transform has a page for every
  // card - in November 2026 they lost the cinema ("/cinema/movie/sutton/<film>"
  // became "/cinema/movie/<film>") and a retrieve matching the old pattern
  // fetched nothing. What can still break is the card markup itself, and that
  // throws here rather than in the transform: a card with no title link, or a
  // venue publishing dates with no cards on any of them.
  //
  // The film page reads the cinema from the `sitecode` cookie, and without it
  // is the chain's site chooser, which carries no credits at all. A chooser
  // here means the cookie has stopped working, and storing it would drop every
  // director and cast member without a word.
  const moviePageUrls = new Set();
  let cardCount = 0;
  for (const [date, html] of Object.entries(datePages)) {
    const $ = cheerio.load(html);
    for (const $card of findMovieCards($)) {
      cardCount++;
      const moviePath = getMovieCardTitleLink($card).attr("href");
      if (!moviePath) {
        throw new Error(
          `A film card on ${date} has no title link - the showtimes page has changed`,
        );
      }
      moviePageUrls.add(getMoviePageUrl(domain, moviePath));
    }
  }
  if (dates.length > 0 && cardCount === 0) {
    throw new Error(
      `Omniplex lists ${dates.length} dates but none of their pages has a film card - the showtimes page has changed`,
    );
  }

  const moviePages = {};
  for (const url of [...moviePageUrls].sort()) {
    const html = await fetchWin1252Text(url, {
      headers: { cookie: `sitecode=${siteCode}` },
    });
    if (isSiteChooser(cheerio.load(html))) {
      throw new Error(
        `Film page ${url} came back as the site chooser - the sitecode cookie (${siteCode}) was not accepted`,
      );
    }
    moviePages[url] = html;
  }

  return { indexPage, datePages, moviePages };
}

module.exports = retrieve;

const cheerio = require("cheerio");
const { fetchWin1252Text } = require("../../common/utils");
const {
  extractAllowedDates,
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
  // fetched once, from every link the showtimes pages carry: the transform then
  // has a page for every film it can find a card for.
  //
  // In November 2026 those links lost the cinema - "/cinema/movie/sutton/<film>"
  // became "/cinema/movie/<film>", and the old address now redirects there - so
  // match on the path alone ("/cinema/movies", the films index, is left out by
  // its trailing slash). The page reads the cinema from the `sitecode` cookie
  // instead, and without it is the chain's site chooser, which carries no
  // credits at all. A chooser here means the cookie has stopped working, and
  // storing it would drop every director and cast member without a word.
  const moviePageUrls = new Set();
  for (const html of [indexPage, ...Object.values(datePages)]) {
    const $ = cheerio.load(html);
    $('a[href^="/cinema/movie/"]').each((i, el) => {
      moviePageUrls.add(getMoviePageUrl(domain, $(el).attr("href")));
    });
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

const { fetchText } = require("../../common/utils.js");
const cheerio = require("cheerio");
const attributes = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);
  const $ = cheerio.load(movieListPage);
  const data = JSON.parse($("#__NEXT_DATA__").html());

  const moviePages = {};
  for (const event of data.props.pageProps.events) {
    const url = `https://dice.fm/event/${event.perm_name}`;
    const html = await fetchText(url);
    moviePages[url] = html;
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;

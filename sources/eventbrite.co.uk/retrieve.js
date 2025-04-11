const { fetchText } = require("../../common/utils.js");
const attributes = require("./attributes");

const getPageServerData = async (url) => {
  const jsonString = (await fetchText(url)).match(
    /\s+window.__SERVER_DATA__ = ({.+});/i,
  )[1];
  // Remove tabs from string the JSON parser throws on
  return JSON.parse(jsonString.replace(/\t/g, " "));
};

async function retrieve() {
  let page = 1;
  let lastPage = 1;
  const movieListPages = [];
  const moviePages = {};

  while (page <= lastPage) {
    const url = `${attributes.url}${page}`;
    const pageData = await getPageServerData(url);

    page += 1;
    lastPage = pageData.page_count;
    movieListPages.push(pageData);
  }

  const events = movieListPages.flatMap(
    ({ search_data: { events } }) => events.results,
  );

  for (const event of events) {
    try {
      const eventData = await getPageServerData(event.url);
      moviePages[event.url] = eventData;
    } catch {
      // Event may have been removed
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;

const { fetchText } = require("../../common/utils.js");
const attributes = require("./attributes");

function uniqueEvents(events) {
  const ids = {};
  return events.filter((event) => {
    const isNewEvent = !ids[event.id];
    ids[event.id] = true;
    return isNewEvent;
  });
}

const getPageServerData = async (url) => {
  const jsonString = (await fetchText(url)).match(
    /\s+window.__SERVER_DATA__ = ({.+});/i,
  )[1];
  // Remove tabs from string the JSON parser throws on
  return JSON.parse(jsonString.replace(/\t/g, " "));
};

const getSearchResultsFor = async (searchTerm) => {
  const movieListPages = [];
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage) {
    const url = `${attributes.url}/${searchTerm}/?page=${page}`;
    const pageData = await getPageServerData(url);

    page += 1;
    lastPage = pageData.page_count;
    movieListPages.push(pageData);
  }
  return movieListPages;
};

async function retrieve() {
  console.log(" - Requesting search results pages...");
  const movieListPages = []
    .concat(await getSearchResultsFor("screening"))
    .concat(await getSearchResultsFor("film-and-media--events")); // This is a specific category

  const events = uniqueEvents(
    movieListPages.flatMap(({ search_data: { events } }) => events.results),
  );

  console.log(` - Requesting details for ${events.length} events...`);
  const moviePages = {};
  for (const [index, event] of events.entries()) {
    try {
      if (index % 10 === 0)
        console.log(
          `    - ${Math.round((index / events.length) * 100)}% complete`,
        );
      const eventData = await getPageServerData(event.url);
      moviePages[event.url] = eventData;
    } catch {
      // Event may have been removed
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;

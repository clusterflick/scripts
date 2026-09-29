const { fetchText, assertSelector } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(
    "https://davidleancinema.ticketsolve.com/shows.xml",
  );
  assertSelector(movieListPage, "venues > venue > shows > show");

  return { movieListPage };
}

module.exports = retrieve;

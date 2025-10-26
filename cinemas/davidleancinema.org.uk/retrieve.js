const { fetchText } = require("../../common/utils");

async function retrieve() {
  const movieListPage = await fetchText(
    "https://davidleancinema.ticketsolve.com/shows.xml",
  );

  return { movieListPage };
}

module.exports = retrieve;

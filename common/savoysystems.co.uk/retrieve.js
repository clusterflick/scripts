const { fetchText } = require("../../common/utils");

async function retrieve({ url }) {
  const movieListPage = await fetchText(url);
  const events = movieListPage.match(
    /<script>\s*var\s+Events\s+=\s+(.*)\s+<\/script>/i,
  );
  return JSON.parse(events[1]);
}

module.exports = retrieve;

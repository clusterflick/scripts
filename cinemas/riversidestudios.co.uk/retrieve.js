const { fetchJson, fetchText, basicNormalize } = require("../../common/utils");
const { domain } = require("./attributes");

// const filmEventType = "101";

async function retrieve() {
  const url = `${domain}/ajax/filter_stream/ZWhHVEdwSDNuekJLUWI1OXVDQ0Fvdz09/?offset=0&limit=500`;

  /*
   * 2025-12-11 -- Riverside have broken their own filtering. The new data URL
   * does not return the necessary data to filter on film, accessibility, etc.
   * This can be seen on the site, where the filtering does not work.
   *
   * Some interesting ids, added to the URL (which don't do anything yet)
   * Accessibility:
   *  - Audio Described: 80879
   *  - BSL: 259
   *  - Relaxed: 80881
   *  - Subtitled: 80883
   *  - Captioned: 80832
   * Cinema:
   *  - Double bill: 224
   *  - Silver Screen: 80787
   *  - Q&A: 80811
   */

  const movieListPage = (await fetchJson(url)).filter((movie) => {
    // For now, as a stop-gap, let's remove events we know are definitely not
    // movies in the hope that the filtering gets fixed soon.
    if (
      /\bworkshops?\b/i.test(basicNormalize(movie.title)) ||
      /\bmusic night\b/i.test(basicNormalize(movie.title)) ||
      /\bbeat the stress\b/i.test(basicNormalize(movie.title)) ||
      /\bdisco-cise\b/i.test(basicNormalize(movie.title)) ||
      /\bline dancing\b/i.test(basicNormalize(movie.title)) ||
      /\brehearsal room\b/i.test(basicNormalize(movie.title)) ||
      /\bopen mic night\b/i.test(basicNormalize(movie.title)) ||
      // Remove specific entry that has no generic terms to match on
      basicNormalize(movie.title).includes("old fat f**k up") ||
      /\bmusic nights?\b/i.test(basicNormalize(movie.search_text)) ||
      /\bworkshops?\b/i.test(basicNormalize(movie.search_text)) ||
      /\bpilates\b/i.test(basicNormalize(movie.search_text)) ||
      /\bconcert\b/i.test(basicNormalize(movie.search_text)) ||
      /\bsolo show\b/i.test(basicNormalize(movie.search_text)) ||
      /\bdebut play\b/i.test(basicNormalize(movie.search_text)) ||
      /\bmusical theatre\b/i.test(basicNormalize(movie.search_text)) ||
      /\byoga\b/i.test(basicNormalize(movie.search_text)) ||
      /\bdjembe drumming\b/i.test(basicNormalize(movie.search_text)) ||
      /\bstand-up comedy\b/i.test(basicNormalize(movie.search_text))
    ) {
      return false;
    }

    return true;
  });

  const moviePages = {};
  for (const movie of movieListPage) {
    moviePages[movie.url] = await fetchText(movie.url);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;

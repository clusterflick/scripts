const cheerio = require("cheerio");
const { fetchText, basicNormalize } = require("../../common/utils");

const url = "https://wimbledonfilmclub.co.uk/";

async function retrieve() {
  const movieListPage = await fetchText(url);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();

  // Get the "Next film:" link - it contains a span with class="filmname"
  $("span.filmname").each(function () {
    const href = $(this).closest("a").attr("href");
    moviePageUrls.add(href);
  });

  // Get all coming up and previous films. We can filter out the previous films
  // when transforming
  $(".wp-block-template-part").each(function () {
    const $section = $(this);

    // Look for the Coming Up column
    if (
      !basicNormalize($section.children("div").first().text()).startsWith(
        "coming up",
      )
    ) {
      return;
    }

    $section.find("a.link").each(function () {
      const href = $(this).attr("href");
      moviePageUrls.add(href);
    });
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;

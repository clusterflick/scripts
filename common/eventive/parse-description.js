const cheerio = require("cheerio");
const { getText } = require("../utils");

/**
 * Eventive descriptions are HTML, and a tenant selling both in-person and
 * virtual screenings links the virtual one from the same blurb. That link
 * describes a different way to watch the film rather than the screening we're
 * listing, so it is dropped before the text is used as a matching hint.
 */
function parseDescription(htmlDescription) {
  if (!htmlDescription) return "";

  const $ = cheerio.load(htmlDescription);
  // Remove any links to virtual screenings to avoid confusion
  $("a").each(function () {
    const href = $(this).attr("href");
    if (href && href.includes("watch.eventive.org")) {
      $(this).remove();
    }
  });
  return getText($.root()).replace(/\s+/g, " ").trim();
}

module.exports = parseDescription;

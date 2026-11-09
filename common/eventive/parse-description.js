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
  // Each block ends its line. Collapsing all whitespace ran a heading into the
  // paragraph after it - "<h3>+ Q&A with director Alexandre Arcady</h3><p>
  // <strong>PRICES:</strong>" read "Alexandre ArcadyPRICES:" - so the reader
  // of the text couldn't tell where one thing stopped and the next began.
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6").after("\n");
  return getText($.root())
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

module.exports = parseDescription;

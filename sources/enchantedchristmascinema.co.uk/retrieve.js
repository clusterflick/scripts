const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const attributes = require("./attributes");

// A pop-up that rents a different building each season, so which venues it is
// at this year is read from its own home page rather than held here - each
// location has a page of its own under /venue/.
async function retrieve() {
  const homePage = await fetchText(attributes.url);
  const $ = cheerio.load(homePage);

  const venuePaths = [
    ...new Set(
      $('a[href^="/venue/"]')
        .map((i, el) => $(el).attr("href"))
        .get(),
    ),
  ];
  if (venuePaths.length === 0) {
    throw new Error(
      "No venue pages linked from the home page. Has the page changed?",
    );
  }

  const venuePages = {};
  for (const venuePath of venuePaths) {
    venuePages[venuePath] = await fetchText(`${attributes.domain}${venuePath}`);
  }

  return { venuePages };
}

module.exports = retrieve;

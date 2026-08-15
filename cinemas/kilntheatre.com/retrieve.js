const cheerio = require("cheerio");
const slugify = require("slugify");
const {
  fetchText,
  assertSelector,
  basicNormalize,
  getText,
} = require("../../common/utils");
const { url, domain } = require("./attributes");

// Some listings link to an unresolved permalink (e.g.
// `/?post_type=event&p=44060`) that 404s instead of the pretty
// `/whats-on/<slug>/` URL. Rebuild the expected URL from the link text so we can
// retry before giving up.
const buildFallbackUrl = (text) => {
  const slug = slugify(basicNormalize(text), { strict: true });
  if (!slug) return undefined;
  return `${domain}/whats-on/${slug}/`;
};

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".c-film-listing");
  const $ = cheerio.load(movieListPage);

  const moviePageLinks = $(".c-film-listing a")
    .map((i, element) => ({
      href: $(element).attr("href"),
      text: getText($(element).find(".c-film-listing__title")),
    }))
    .get();

  const moviePages = {};
  const seen = new Set();
  for (const { href, text } of moviePageLinks) {
    if (seen.has(href)) continue;
    seen.add(href);

    try {
      moviePages[href] = await fetchText(href);
      continue;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    const fallbackUrl = buildFallbackUrl(text);
    if (fallbackUrl && fallbackUrl !== href) {
      try {
        console.log(
          `[kilntheatre.com] ${href} returned 404; retrying with ${fallbackUrl} (built from "${text}")`,
        );
        moviePages[fallbackUrl] = await fetchText(fallbackUrl);
        continue;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }

    // The listing links to a film that has no published page — usually an
    // unpublished event post. Nothing to retrieve, so skip it rather than
    // failing the whole venue for one broken link.
    console.log(
      `[kilntheatre.com] Skipping "${text}" - ${href} returned 404 and no published page could be found`,
    );
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;

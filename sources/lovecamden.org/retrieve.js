const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");
const attributes = require("./attributes");
const { getStories, isFilm } = require("./utils");

// Every page on the site is behind a Cloudflare managed challenge, which a
// plain fetch can't pass but the stealth browser does. It asks for each page's
// own data rather than the page: the what's on page's lists every event the
// site has in one response, and an event's adds what the list leaves out -
// its description, coordinates and booking link.
const getDataUrl = (pagePath) =>
  new URL(`${pagePath.replace(/\/$/, "")}/__data.json`, attributes.domain).href;

const fetchData = (getPage, pagePath, cacheKey) => {
  const url = getDataUrl(pagePath);
  return getPage(url, cacheKey, async (page, response) => {
    const body = await response.text();
    // A challenge page in place of the data is thrown rather than returned,
    // so it isn't cached as the day's answer
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(
        `${url} answered with ${response.status()} and no JSON — it may have been challenged`,
      );
    }
  });
};

async function retrieve() {
  return withPlaywrightSession(async (getPage) => {
    const whatsOnData = await fetchData(
      getPage,
      "/whats-on",
      "lovecamden-whats-on",
    );

    const eventData = {};
    for (const { full_slug: slug } of getStories(whatsOnData).filter(isFilm)) {
      eventData[slug] = await fetchData(
        getPage,
        `/${slug}`,
        `lovecamden-${slug.split("/").filter(Boolean).pop()}`,
      );
    }

    return { whatsOnData, eventData };
  });
}

module.exports = retrieve;

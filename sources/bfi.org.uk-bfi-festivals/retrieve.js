const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");

const FESTIVALS = [
  {
    id: "flare",
    name: "BFI Flare",
    azUrl:
      "https://whatson.bfi.org.uk/flare/Online/default.asp?BOparam::WScontent::loadArticle::permalink=flare-films-az",
    domain: "https://whatson.bfi.org.uk/flare/Online/",
  },
];

async function getAzPage(festival) {
  return getPageWithPlaywright(
    festival.azUrl,
    `bfi.org.uk-bfi-festivals-az-${festival.id}`,
    async (page) => {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      await page.locator("#content").waitFor({ strict: false });
      return page.content();
    },
  );
}

async function getMoviePage(articleUrl) {
  const slug = new URL(articleUrl).searchParams.get(
    "BOparam::WScontent::loadArticle::permalink",
  );
  return getPageWithPlaywright(
    articleUrl,
    `bfi.org.uk-bfi-festivals-${slug}`,
    async (page) => {
      // All details needed are in the HTML, but let's go gently when getting
      // data from the BFI site.
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      const errorLocator = page
        .locator("#content h2")
        .filter({ hasText: /500 - internal server error/i });
      const validContentLocator = page.locator(".Film-info__information");

      await errorLocator
        .or(validContentLocator.first())
        .waitFor({ state: "attached" });

      if (await errorLocator.isVisible()) {
        const errorText = await errorLocator.textContent();
        return new Error(`Error page detected - ${errorText}`);
      }

      const html = await page.content();
      if (typeof html !== "string" || html.length === 0) {
        return new Error(`Empty page contents at ${articleUrl}`);
      }

      const searchResults = await page.evaluate(
        // eslint-disable-next-line no-undef
        () => window.articleContext?.searchResults ?? null,
      );

      return { html, searchResults };
    },
  );
}

async function retrieve() {
  const movieListPages = {};
  const moviePages = {};

  for (const festival of FESTIVALS) {
    console.log(`    - Retrieving A-Z page for ${festival.name} ...`);
    const html = await getAzPage(festival);
    movieListPages[festival.id] = html;

    const $ = cheerio.load(html);
    const articleUrls = new Set();

    $(".main-article-body .Rich-text li > a").each(function () {
      const articleUrl = $(this).attr("href");
      articleUrls.add(articleUrl);
    });

    for (const url of articleUrls) {
      const absoluteUrl = `${festival.domain}${url}`;
      console.log(
        `    - [${Date.now()}] Getting data for article ${absoluteUrl} ...`,
      );
      const result = await getMoviePage(absoluteUrl);

      if (result instanceof Error) throw result;

      moviePages[absoluteUrl] = {
        ...result,
        domain: festival.domain,
        festival: festival.name,
      };
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;

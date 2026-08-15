const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const { fetchJson, fetchText, sleep } = require("../../common/utils");

const BASE_URL = "https://bechdeltest.com";
const CACHE_KEY = "bechdel-dataset";

// bechdeltest.com used to expose /api/v1/getAllMovies, which carried an IMDb id
// per film. That endpoint now returns 410 Gone, so the dataset is rebuilt from
// the two things the site still publishes: search/index.json for the ratings,
// and the year listings for the IMDb ids that let us join on them.
const INDEX_URL = `${BASE_URL}/search/index.json`;

// Year listings page at 200 entries: /year/<year>/ is the first page and
// /year/<year>/page/<n>/ each hold the next 200, with no overlap.
const YEAR_PAGE_SIZE = 200;

// The site blocks a handful of named crawlers via robots.txt, so identify
// ourselves rather than fetching as bare Node.
const HEADERS = {
  "User-Agent": "clusterflick.com (+https://github.com/clusterflick)",
};

// Being a slow, once-a-day crawl of ~160 pages, there's no reason to hurry.
const PAGE_DELAY_MS = 200;

// A film only counts as passing when it clears all three criteria. Anything
// below is a partial score, not a pass.
const PASSING_RATING = 3;

// The crawl resolves an IMDb id for essentially every entry, so a large
// shortfall means the listing markup has changed rather than that the site is
// missing data - fail instead of silently publishing a half-empty dataset.
const MINIMUM_RESOLVED_RATIO = 0.95;

let dataset = null;

// Each entry is `[id, title, year, rating, dubious]`, where rating is the
// number of criteria met (0-3) and dubious flags a rating the site considers
// disputed. Dubious is independent of the rating - a film can pass all three
// tests and still be marked dubious.
const getRatingsIndex = async () => {
  const index = await fetchJson(INDEX_URL, { headers: HEADERS });

  if (!Array.isArray(index) || index.length === 0) {
    throw new Error(`Bechdel Test index at ${INDEX_URL} was not a list`);
  }

  return index.map(([id, title, year, rating, dubious]) => {
    if (typeof id !== "number" || typeof rating !== "number") {
      throw new Error(
        `Unexpected Bechdel Test index entry: ${JSON.stringify([id, title, year, rating, dubious])}`,
      );
    }
    return { id, title, year, rating, dubious: dubious === 1 };
  });
};

// Listing entries pair the IMDb link with the film's own page:
//   <div class="movie">
//     <a href="https://www.imdb.com/title/tt3566834/"><img alt="[2]"></a>
//     <a id="movie-11663" href="/view/11663/a_minecraft_movie/">A Minecraft Movie</a>
//   </div>
//
// The listing's own href is kept rather than rebuilt from the id: /view/<id>/
// resolves, but only to a meta-refresh interstitial, so the slug is what makes
// a link land on the film page.
const parseYearPage = (html) => {
  const $ = cheerio.load(html);
  const entries = [];

  $("div.movie").each((index, element) => {
    const $movie = $(element);
    const $link = $movie.find('a[id^="movie-"]');
    const id = parseInt($link.attr("id")?.replace("movie-", ""), 10);
    const path = $link.attr("href");
    const imdbId = $movie
      .find('a[href*="imdb.com/title/"]')
      .attr("href")
      ?.match(/(tt\d+)/)?.[1];

    if (!Number.isInteger(id) || !path || !imdbId) return;
    entries.push({ id, imdbId, url: `${BASE_URL}${path}` });
  });

  return entries;
};

const getYearPageUrls = (ratings) => {
  const countsByYear = {};
  ratings.forEach(({ year }) => {
    countsByYear[year] = (countsByYear[year] ?? 0) + 1;
  });

  return Object.keys(countsByYear)
    .sort()
    .flatMap((year) => {
      const pages = Math.ceil(countsByYear[year] / YEAR_PAGE_SIZE);
      return Array.from({ length: pages }, (_, page) =>
        page === 0
          ? `${BASE_URL}/year/${year}/`
          : `${BASE_URL}/year/${year}/page/${page}/`,
      );
    });
};

const getListingsById = async (ratings) => {
  const urls = getYearPageUrls(ratings);
  const listingsById = {};

  for (const [index, url] of urls.entries()) {
    process.stdout.write(
      `\r\tCrawling Bechdel Test year listings [${index + 1} of ${urls.length}] ...`,
    );
    const html = await fetchText(url, { headers: HEADERS });
    parseYearPage(html).forEach(({ id, imdbId, url: movieUrl }) => {
      listingsById[id] = { imdbId, url: movieUrl };
    });
    await sleep(PAGE_DELAY_MS);
  }

  return listingsById;
};

const buildDataset = async () => {
  const ratings = await getRatingsIndex();
  const listingsById = await getListingsById(ratings);

  const movies = {};
  let resolved = 0;

  ratings.forEach(({ id, rating, dubious }) => {
    const listing = listingsById[id];
    if (!listing) return;
    resolved++;
    movies[listing.imdbId] = {
      id,
      url: listing.url,
      rating,
      passes: rating === PASSING_RATING,
      dubious,
    };
  });

  const resolvedRatio = resolved / ratings.length;
  if (resolvedRatio < MINIMUM_RESOLVED_RATIO) {
    throw new Error(
      `Only resolved an IMDB id for ${resolved} of ${ratings.length} Bechdel Test entries ` +
        `(${Math.round(resolvedRatio * 100)}%) - the year listing markup has likely changed`,
    );
  }

  console.log(
    `\n\tBuilt Bechdel Test dataset: ${resolved} of ${ratings.length} entries matched to an IMDB id`,
  );

  return movies;
};

const getDataset = async () => {
  if (dataset) return dataset;

  dataset = await dailyCache(CACHE_KEY, buildDataset);
  return dataset;
};

async function findBechdelMatch({ imdbId }) {
  if (!imdbId) return undefined;

  const movies = await getDataset();
  return movies[imdbId];
}

module.exports = findBechdelMatch;
module.exports.parseYearPage = parseYearPage;
module.exports.getYearPageUrls = getYearPageUrls;

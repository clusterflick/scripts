const path = require("node:path");
const fs = require("node:fs").promises;
const getModuleNamesFor = require("../common/get-module-names-for");
const normalizeTitle = require("../common/normalize-title");

(async function () {
  const cinemasPath = path.join(__dirname, "..", "cinemas");
  const sites = await getModuleNamesFor(cinemasPath);
  const data = {};
  for (const site of sites) {
    const filePath = path.join(__dirname, "..", "transformed-data", site);
    data[site] = JSON.parse(await fs.readFile(filePath, "utf8"));
  }

  const flaggedForReview = {};
  Object.keys(data).forEach((site) => {
    const siteData = data[site];
    siteData.forEach((movie) => {
      if (!movie.themoviedb) {
        flaggedForReview[movie.title] = flaggedForReview[movie.title] || [];
        flaggedForReview[movie.title].push({ site, movie });
      }
    });
  });

  Object.keys(flaggedForReview).forEach((key, index) => {
    const matches = flaggedForReview[key];
    const normalizedTitle = normalizeTitle(key);
    const year = matches[0].movie.overview.year;
    const sites = matches.map(({ site }) => site).join(", ");
    console.log(`${index + 1}. "${key}" (from ${sites})`);
    console.log(
      `    - Searching for: "${normalizedTitle}"${year ? ` (${year})` : ""}`,
    );
    console.log(
      `    - Search for matches: https://www.themoviedb.org/search/movie?query=${encodeURIComponent(normalizedTitle)}`,
    );
    console.log(`    - Source: ${matches[0].movie.url}`);
    console.log(" ");
  });
})();

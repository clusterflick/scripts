const path = require("node:path");
const fs = require("node:fs").promises;
const normalizeTitle = require("../common/normalize-title");
const { getAllCinemaNames } = require("../cinemas");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

const categoryColors = {
  movie: colors.green,
  "multiple-movies": colors.magenta,
  tv: colors.blue,
  shorts: colors.cyan,
  quiz: colors.yellow,
  comedy: colors.yellow,
  music: colors.yellow,
  talk: colors.yellow,
  workshop: colors.yellow,
  event: colors.gray,
};

const formatCategory = (category) => {
  const color = categoryColors[category] || colors.gray;
  return `${color}${category}${colors.reset}`;
};

(async function () {
  const sites = getAllCinemaNames();
  const data = {};
  let loadedCount = 0;
  let skippedCount = 0;

  for (const site of sites) {
    const filePath = path.join(__dirname, "..", "transformed-data", site);
    try {
      data[site] = JSON.parse(await fs.readFile(filePath, "utf8"));
      loadedCount++;
    } catch {
      skippedCount++;
    }
  }

  console.log(
    `\n${colors.bright}📊 Loaded data from ${loadedCount} cinemas${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}${colors.reset}\n`,
  );

  const flaggedForReview = {};
  const categoryCounts = {};
  const venueData = {};

  Object.keys(data).forEach((site) => {
    const siteData = data[site];
    siteData.forEach((movie) => {
      // Check for single movie match
      const hasSingleMatch = !!movie.themoviedb;
      // Check for multiple movies match (for double bills, marathons, etc.)
      const hasMultipleMatches =
        Array.isArray(movie.themoviedbs) && movie.themoviedbs.length > 0;

      if (!hasSingleMatch && !hasMultipleMatches) {
        flaggedForReview[movie.title] = flaggedForReview[movie.title] || [];
        flaggedForReview[movie.title].push({ site, movie });

        const category = movie.category || "unknown";
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;

        // Track both total count and category breakdown per venue
        venueData[site] = venueData[site] || { total: 0, categories: {} };
        venueData[site].total++;
        venueData[site].categories[category] =
          (venueData[site].categories[category] || 0) + 1;
      }
    });
  });

  const entries = Object.keys(flaggedForReview);
  const totalUnmatched = Object.values(flaggedForReview).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  console.log(
    `${colors.bright}🔍 Found ${entries.length} unique unmatched titles (${totalUnmatched} total instances)${colors.reset}\n`,
  );
  console.log(`${colors.dim}${"─".repeat(80)}${colors.reset}\n`);

  entries.forEach((key, index) => {
    const matches = flaggedForReview[key];
    const normalizedTitle = normalizeTitle(key);
    const year = matches[0].movie.overview.year;
    const category = matches[0].movie.category || "unknown";
    const siteList = matches.map(({ site }) => site);

    // Title line with index and category
    console.log(
      `${colors.bright}${String(index + 1).padStart(3, " ")}.${colors.reset} ${colors.cyan}"${key}"${colors.reset}`,
    );
    console.log(
      `     ${colors.dim}Category:${colors.reset} ${formatCategory(category)}`,
    );

    // Normalized search info
    console.log(
      `     ${colors.dim}Normalized:${colors.reset} "${normalizedTitle}"${year ? ` ${colors.dim}(${year})${colors.reset}` : ""}`,
    );

    // TMDB search link
    const searchUrl = `https://www.themoviedb.org/search/movie?query=${encodeURIComponent(normalizedTitle)}`;
    console.log(`     ${colors.dim}TMDB Search:${colors.reset} ${searchUrl}`);

    // Source URL
    console.log(
      `     ${colors.dim}Source:${colors.reset} ${matches[0].movie.url}`,
    );

    // Venues (collapsed if many)
    if (siteList.length <= 3) {
      console.log(
        `     ${colors.dim}Venues:${colors.reset} ${siteList.join(", ")}`,
      );
    } else {
      console.log(
        `     ${colors.dim}Venues:${colors.reset} ${siteList.slice(0, 3).join(", ")} ${colors.dim}(+${siteList.length - 3} more)${colors.reset}`,
      );
    }

    console.log();
  });

  // Summary by category
  console.log(`${colors.dim}${"─".repeat(80)}${colors.reset}\n`);
  console.log(`${colors.bright}📈 Summary by Category${colors.reset}\n`);

  const sortedCategories = Object.entries(categoryCounts).sort(
    ([, a], [, b]) => b - a,
  );

  const maxCount = sortedCategories[0]?.[1] || 1;
  const maxBarLength = 40;

  for (const [category, count] of sortedCategories) {
    const barLength = Math.round((count / maxCount) * maxBarLength);
    const bar = "█".repeat(barLength);
    console.log(
      `   ${formatCategory(category.padEnd(16))} ${colors.dim}${bar}${colors.reset} ${count}`,
    );
  }

  // Summary by venue
  console.log(`\n${colors.dim}${"─".repeat(80)}${colors.reset}\n`);
  console.log(`${colors.bright}🏢 Summary by Venue${colors.reset}\n`);

  const sortedVenues = Object.entries(venueData).sort(
    ([, a], [, b]) => b.total - a.total,
  );

  // Find the longest venue name for padding
  const maxVenueLength = Math.max(
    ...sortedVenues.map(([venue]) => venue.length),
  );

  for (const [venue, { categories }] of sortedVenues) {
    // Category breakdown for this venue
    const sortedVenueCategories = Object.entries(categories).sort(
      ([, a], [, b]) => b - a,
    );
    const categoryBreakdown = sortedVenueCategories
      .map(
        ([cat, count]) =>
          `${colors.dim}${count} ×${colors.reset} ${formatCategory(cat)}`,
      )
      .join(`${colors.dim},${colors.reset} `);

    const paddedVenue = venue.padEnd(maxVenueLength + 4);
    console.log(
      `   ${colors.cyan}${paddedVenue}${colors.reset}${colors.dim}[${colors.reset}${categoryBreakdown}${colors.dim}]${colors.reset}`,
    );
  }

  console.log();
})();

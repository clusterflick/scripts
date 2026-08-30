const { fetchText, fetchJson } = require("../../common/utils");
const { extractScreenings } = require("./utils");
const { url, domain } = require("./attributes");

// The screenings API intermittently 500s on an individual screening — the run
// that surfaced this failed three times in 47s on the same id and was fine on
// a retry hours later. A 500 is normally permanent, so it stays out of the
// shared retryable set; widen it here only, where it reads as a transient
// upstream blip rather than a broken record. Backed off so the budget spans a
// dip lasting minutes, not the seconds a fixed delay would cover.
const SCREENING_RETRY_CONFIG = {
  retries: 3,
  delayMs: 5_000,
  backoffFactor: 2,
  retryStatuses: [500],
};

async function retrieve() {
  const movieListPage = await fetchText(url);

  const screeningIds = extractScreenings(movieListPage).map(({ id }) => id);
  if (screeningIds.length === 0) {
    throw new Error("No screenings found. Has the page data changed?");
  }

  const screenings = [];
  for (const id of screeningIds) {
    const screening = await fetchJson(
      `${domain}/api/screenings/${id}`,
      undefined,
      SCREENING_RETRY_CONFIG,
    );
    if (screening.error) {
      throw new Error(`API error for screening ${id}: ${screening.error}`);
    }
    screenings.push(screening);
  }

  return { movieListPage, screenings };
}

module.exports = retrieve;

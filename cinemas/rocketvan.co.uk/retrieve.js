const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url } = require("./attributes");

// The app definition id of Wix Events, which is the same on every Wix site. The
// events page renders its listings server-side and carries the data behind
// them in the page's warmup JSON, keyed by this id and then by widget.
const WIX_EVENTS_APP_ID = "140603ad-af8d-84a5-2c80-a0f60cb47351";

async function retrieve() {
  const movieListPage = await fetchText(url);
  const $ = cheerio.load(movieListPage);

  const warmupData = $("script#wix-warmup-data").text();
  if (!warmupData) {
    throw new Error(
      `No "script#wix-warmup-data" found on ${url} - the page structure may have changed`,
    );
  }

  const widgets = JSON.parse(warmupData).appsWarmupData?.[WIX_EVENTS_APP_ID];
  if (!widgets) {
    throw new Error(
      `No Wix Events data found on ${url} - the page structure may have changed`,
    );
  }

  // The page carries the events app twice - a list and a carousel - and each
  // widget has its own copy of the same events, the carousel cut shorter. Every
  // widget is read and the events are deduplicated by id, so the one that
  // happens to hold the full set doesn't have to be picked out by its
  // generated component id.
  const events = new Map();
  for (const [widgetId, widget] of Object.entries(widgets)) {
    if (!Array.isArray(widget.events?.events)) {
      throw new Error(
        `No events list in Wix Events widget ${widgetId} on ${url} - the page structure may have changed`,
      );
    }
    // A widget holding more than it rendered would leave events out of the
    // page, and nothing downstream could tell they were missing.
    if (widget.events.hasMore) {
      throw new Error(
        `Wix Events widget ${widgetId} on ${url} has more events than the page rendered`,
      );
    }
    for (const event of widget.events.events) {
      events.set(event.id, event);
    }
  }

  return { events: [...events.values()] };
}

module.exports = retrieve;

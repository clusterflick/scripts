// A maintenance page is the site deliberately serving a holding page instead of
// its content. Unlike a bot challenge it is not aimed at us - retrying, waiting,
// or coming from a different IP changes nothing - and unlike a probe error there
// is nothing wrong on our side. It is an observation about the source, so the
// row records it and the job stays amber.
//
// Matched on the copy, because there is no header for it: a holding page is just
// a page. Cloudflare's presence is NOT a signal here - every page it fronts
// carries the `challenge-platform/scripts/jsd/main.js` detection beacon, so
// matching on that would call every Cloudflare-fronted site a challenge.
//
// Only ever run against a body that already failed to be the content we asked
// for - see the note on `classifyFailure` - since a listing could legitimately
// contain these words.
const MAINTENANCE_PAGE_TEXT =
  /undergoing maintenance|down for maintenance|under maintenance|temporarily unavailable|<title>\s*holding page\s*<\/title>/i;

const isMaintenancePage = (content) =>
  Boolean(content) && MAINTENANCE_PAGE_TEXT.test(content);

module.exports = {
  MAINTENANCE_PAGE_TEXT,
  isMaintenancePage,
};

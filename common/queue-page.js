// A virtual waiting room is the source holding every visitor in a queue and
// letting them through as capacity allows - BFI puts one in front of whatson
// for a festival on-sale. Like a maintenance page it is not aimed at us: a
// fresh session or a different IP joins the same queue, and unlike a bot
// challenge there is nothing to clear. It is an observation about the source,
// so the row records it and the job stays amber.
//
// Matched on where we ended up rather than on the page, because Queue-it sends
// the visitor to a waiting room on its own `<customer-id>.queue-it.net` host
// with a 302. The URL is the one thing a waiting room cannot reword - the page
// itself is a customer-themed template, down to its copy and its markup.
//
// The connector's own markup is deliberately NOT a signal. A site running the
// server-side connector stamps the pages it lets through with
// `<meta id="queue-it_log" data-proxyurl="https://logging.queue-it.net/...">`,
// and the client-side one loads `static.queue-it.net/script/queueclient.min.js`
// on every protected page. Both say Queue-it is installed, which is true of
// every page on a protected site whether or not anyone is queueing, so matching
// on them would file BFI's own frequent 500s as a waiting room. Same trap as
// Cloudflare's detection beacon - see maintenance-page.js.
const WAITING_ROOM_HOST = /(^|\.)queue-it\.net$/i;

const isQueuePage = (url) => {
  if (!url) return false;
  try {
    return WAITING_ROOM_HOST.test(new URL(url).hostname);
  } catch {
    // Not a URL we can read a host off - `about:blank` on a navigation that
    // never landed, most often. Nothing to conclude either way.
    return false;
  }
};

module.exports = {
  WAITING_ROOM_HOST,
  isQueuePage,
};

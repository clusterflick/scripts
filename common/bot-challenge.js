// A bot challenge (Cloudflare et al.) serves a JS-challenge page in place of the
// content. It means the site is up but blocking us — NOT that the page we asked
// for is gone.
const BOT_CHALLENGE_TEXT =
  /Checking if your connection|Just a moment|Attention Required|cf-browser-verification|cf_chl|Enable JavaScript and cookies to continue/i;

// Cloudflare labels every challenged response with `cf-mitigated: challenge`.
// That's the definitive signal — unlike the page copy, which Cloudflare rewords
// and which sites can customise — so prefer it wherever response headers are to
// hand. Takes a Playwright response, which is null when a navigation didn't
// produce one.
const isBotChallengeResponse = (response) =>
  response?.headers()["cf-mitigated"] === "challenge";

// The same signal read off a `fetch` Response, whose headers are a `Headers`
// instance rather than Playwright's `headers()` accessor.
const isBotChallengeFetchResponse = (response) =>
  response?.headers?.get("cf-mitigated") === "challenge";

// A *block* is not a challenge: there is no puzzle being offered, the request
// was simply refused. It carries no `cf-mitigated` header and none of the
// challenge copy, so without this it reads as an ordinary failed page load —
// which is exactly how a Camoufox `geoip: true` deny on TicketSource presented,
// and it cost hours to tell apart from a challenge we were failing to solve.
//
// Covers Cloudflare's stock wording and the self-branded pages sites serve in
// its place. Takes page text/HTML, since the response carries no signal.
const BOT_BLOCK_TEXT =
  /has been blocked from accessing|Sorry, you have been blocked|You are unable to access/i;

const isBotBlockText = (html) => Boolean(html) && BOT_BLOCK_TEXT.test(html);

module.exports = {
  BOT_CHALLENGE_TEXT,
  BOT_BLOCK_TEXT,
  isBotBlockText,
  isBotChallengeResponse,
  isBotChallengeFetchResponse,
};

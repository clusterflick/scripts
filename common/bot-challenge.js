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

module.exports = {
  BOT_CHALLENGE_TEXT,
  isBotChallengeResponse,
  isBotChallengeFetchResponse,
};

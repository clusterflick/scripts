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

// SiteGround's equivalent, read off a `fetch` Response. Its challenge is a 202
// carrying a meta refresh to `/.well-known/sgcaptcha/`, which `fetch` counts as
// ok - so without this a challenge passes for the page itself. It labels every
// challenged response with `sg-captcha: challenge`, the header to trust over
// its copy for the same reason as Cloudflare's.
const isSiteGroundChallengeFetchResponse = (response) =>
  response?.headers?.get("sg-captcha") === "challenge";

// Bunny Shield's equivalent, read off a `fetch` Response. Its challenge is a
// 403 proof-of-work page ("Establishing a secure connection ...") that only a
// browser can complete, and every challenged response carries
// `cdn-challenge: true` - the header to trust over its copy, as above.
const isBunnyShieldChallengeFetchResponse = (response) =>
  response?.headers?.get("cdn-challenge") === "true";

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

// The vendor headers above, in the order they are trusted. Each is definitive
// for its vendor, so the first to match names the refusal.
const CHALLENGE_HEADERS = [
  { header: "cf-mitigated", value: "challenge", vendor: "cloudflare" },
  { header: "sg-captcha", value: "challenge", vendor: "siteground" },
  { header: "cdn-challenge", value: "true", vendor: "bunny-shield" },
];

// Say whether a response was a bot refusal, and which: `{ kind, vendor, via,
// status }`, or null for anything else. `kind` is "challenge" (a puzzle a
// browser might solve) or "block" (refused outright, where a browser on the same
// IP will fare no better).
//
// Takes the parts every kind of response can hand over - a status, a header
// getter and, when it has been read, the body - so a `fetch` Response, a
// Playwright response and a call made from inside a page are all judged the same
// way. See the adapters below.
//
// The body is only read on a non-2xx status. The challenge copy includes phrases
// ("Just a moment") a film title could carry, so a good page must never be
// judged on its text. `failed` lifts that for a caller that already knows the
// body isn't what it asked for - a health probe whose 200 wasn't JSON - since
// then there is no good page to misjudge. A block is checked before the
// challenge copy because Cloudflare's block page carries "Attention Required"
// too.
const classifyRefusal = ({ status, getHeader, body, failed = false }) => {
  for (const { header, value, vendor } of CHALLENGE_HEADERS) {
    if (getHeader(header) === value) {
      return { kind: "challenge", vendor, via: header, status };
    }
  }
  const ok = status >= 200 && status < 300;
  if ((ok && !failed) || !body) return null;
  if (isBotBlockText(body)) {
    return { kind: "block", vendor: null, via: "response-text", status };
  }
  if (BOT_CHALLENGE_TEXT.test(body)) {
    return { kind: "challenge", vendor: null, via: "response-text", status };
  }
  return null;
};

const classifyFetchResponse = (response, body, { failed } = {}) =>
  classifyRefusal({
    status: response.status,
    getHeader: (name) => response.headers?.get?.(name) ?? null,
    body,
    failed,
  });

// A Playwright response is null when a navigation didn't produce one, and then
// only the page text is left to go on.
const classifyPlaywrightResponse = (response, body, { failed } = {}) =>
  classifyRefusal({
    status: response ? response.status() : 0,
    getHeader: (name) => response?.headers()[name] ?? null,
    body,
    failed,
  });

// For the plain fields `requestFromPage` in `common/camoufox-site-page.js` hands
// back from inside a browser page.
const classifyPageRequest = ({ status, headers = {}, body }) =>
  classifyRefusal({
    status,
    getHeader: (name) => headers[name] ?? null,
    body,
  });

const describeClassification = ({ kind, vendor, via, status }) =>
  `${status} ${kind === "block" ? "block" : "challenge"} (${vendor ?? "unknown vendor"}, via ${via})`;

// The one line every detection writes, wherever it was made, so a single search
// of a run's log finds every refusal in it. It only reports: whether a refusal
// fails the run, escalates or is shrugged off is the caller's call.
const logRefusal = (classification, url) => {
  console.log(
    `      - 🤖 Bot ${describeClassification(classification)} at ${url}`,
  );
};

module.exports = {
  BOT_CHALLENGE_TEXT,
  BOT_BLOCK_TEXT,
  classifyFetchResponse,
  classifyPageRequest,
  classifyPlaywrightResponse,
  classifyRefusal,
  describeClassification,
  isBotBlockText,
  logRefusal,
  isBotChallengeResponse,
  isBotChallengeFetchResponse,
  isBunnyShieldChallengeFetchResponse,
  isSiteGroundChallengeFetchResponse,
};

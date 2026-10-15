const { classifyPlaywrightResponse, logRefusal } = require("./bot-challenge");

// Bot refusal logging for the two browser sessions,
// `get-page-with-playwright.js` and `get-page-with-camoufox.js`. Detection is
// a diagnostic: these never throw. A throw on a navigation would fail a page
// that loaded, and on the failure path it would replace the error being
// reported.

// Logged even when the callback goes on to get past it, so a challenge the
// browser solved still shows in the run's log. Headers only: the page text is
// judged by `reportPageRefusal`, once the load has failed.
const reportNavigationRefusal = (response, url) => {
  try {
    const refusal = classifyPlaywrightResponse(response);
    if (refusal) logRefusal(refusal, url);
  } catch {
    // Best-effort - see above.
  }
};

// Say whether the page a failed load was left on was a bot refusal. A timed
// out selector reads the same whether the site changed or a challenge never
// cleared, and only one of those is fixed by editing the selector. A refused
// navigation was already logged by `reportNavigationRefusal`, so this only adds
// one the page itself shows.
const reportPageRefusal = (response, content, page) => {
  try {
    const refusal = classifyPlaywrightResponse(response, content);
    if (refusal?.via === "response-text") logRefusal(refusal, page.url());
  } catch {
    // Best-effort - see above.
  }
};

module.exports = { reportNavigationRefusal, reportPageRefusal };

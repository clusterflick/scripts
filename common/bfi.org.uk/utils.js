const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

function parseDate(date) {
  return parse(date, "EEEE dd MMMM yyyy HH:mm", new Date(), {
    locale: enGB,
  });
}

// BFI pages embed a `searchResults` JavaScript array listing performances for
// the page's context. It's a plain array of arrays of strings, so it parses as
// JSON once isolated. The array is a property in an object literal, so it always
// closes with `],` followed by the next property key — that terminator lets us
// grab the literal without a bracket-counting parser. Returns [] when it can't
// be found or parsed, so callers can treat it as an optional enhancement rather
// than a hard dependency.
function extractSearchResults(html) {
  if (typeof html !== "string") return [];

  const match = html.match(
    /searchResults\s*:\s*(\[[\s\S]*?\])\s*,\s*[A-Za-z_$][\w$]*\s*:/,
  );
  if (!match) return [];

  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

module.exports = {
  parseDate,
  extractSearchResults,
};

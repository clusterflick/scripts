const cheerio = require("cheerio");

// The visible "Book here" links only expose one screening per film, so films
// with multiple showtimes lose their extra performances. The full set of
// screenings (every showtime) is streamed into the page as `initialScreenings`
// inside the Next.js RSC payload, so we read them from there: the retrieve
// takes their ids and asks the API for each screening in full, and the health
// probe counts what the payload already carries.
function findInitialScreenings(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInitialScreenings(child);
      if (found) return found;
    }
  } else if (node && typeof node === "object") {
    if (Array.isArray(node.initialScreenings)) return node.initialScreenings;
    for (const value of Object.values(node)) {
      const found = findInitialScreenings(value);
      if (found) return found;
    }
  }
  return null;
}

function extractScreenings(html) {
  const $ = cheerio.load(html);

  // The RSC payload is split into one `self.__next_f.push([id, "chunk"])` call
  // per script tag; grab the one holding our data.
  const script = $("script")
    .filter((i, el) => ($(el).html() || "").includes("initialScreenings"))
    .first()
    .html();

  const pushMatch = script?.match(/^self\.__next_f\.push\((\[.*\])\)$/s);
  if (!pushMatch) {
    throw new Error(
      "Could not find the RSC payload script. Has the page data changed?",
    );
  }

  // The push argument is `[chunkId, "<refId>:<react tree JSON>"]`. Parse the
  // argument, drop the leading RSC ref id, then parse the React tree itself.
  const [, chunk] = JSON.parse(pushMatch[1]);
  const tree = JSON.parse(chunk.replace(/^\d+:/, ""));

  const screenings = findInitialScreenings(tree);
  if (!screenings) {
    throw new Error(
      "Could not find initialScreenings in page data. Has the page data changed?",
    );
  }
  return screenings;
}

module.exports = { extractScreenings };

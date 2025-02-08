const { fetchText } = require("../../common/utils");

async function retrieve({ url }) {
  const site = await fetchText(url);
  const [, data] = site.match(
    /\/*\s+<!\[CDATA\[\s+\*\/\s+var\s+electric\s+=\s+(.+?);\s+\/\*\s+\]\]>\s+\*\//i,
  );
  return JSON.parse(data);
}

module.exports = retrieve;

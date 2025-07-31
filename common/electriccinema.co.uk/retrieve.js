const { fetchJson } = require("../../common/utils");

async function retrieve({ domain }) {
  const site = await fetchJson(`${domain}/data/data.json`);
  return site;
}

module.exports = retrieve;

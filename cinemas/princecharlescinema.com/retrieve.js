const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  return await fetchText(`${domain}/whats-on/`);
}

module.exports = retrieve;

const ocapiv1Retrieve = require("../ocapi-v1/retrieve");
const { fetchText, fetchJson } = require("../../common/utils");

async function retrieve(attributes) {
  const path = attributes.url.replace(attributes.domain, "");
  const workflowDataData = await fetchJson(
    `https://www.curzon.com/api/omnia/v1/page?friendly=${path}/`,
  );
  const cinemaId = workflowDataData.vistaCinema.key;

  const mainPage = await fetchText(attributes.url);
  const inititialiseData = JSON.parse(
    mainPage.match(/^\s+window\.initialData\s+=\s+({.+});$/im)[1],
  );

  return ocapiv1Retrieve({ ...attributes, cinemaId }, inititialiseData.api);
}

module.exports = retrieve;

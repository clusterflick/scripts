const ocapiv1Retrieve = require("../ocapi-v1/retrieve");
const { fetchText } = require("../../common/utils");

async function retrieve(attributes) {
  const mainPage = await fetchText(attributes.url);

  const workflowDataData = JSON.parse(
    mainPage.match(/^\s+workflowData:\s+({.+}),$/im)[1],
  );
  const { siteId: cinemaId } = workflowDataData.entityIds;

  const inititialiseData = JSON.parse(
    mainPage.match(/^\s+occInititialiseData:\s+({.+}),$/im)[1],
  );

  return ocapiv1Retrieve({ ...attributes, cinemaId }, inititialiseData.api);
}

module.exports = retrieve;

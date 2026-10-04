const attributes = require("./attributes");
const unflatten = require("./unflatten");

// A page's data arrives as a node per layout and page; find the page's own
// by what it holds rather than where it sits in the list
function findNodeData(pageData, predicate) {
  for (const node of pageData?.nodes ?? []) {
    if (node?.type !== "data") continue;
    const data = unflatten(node.data);
    if (predicate(data)) return data;
  }
  return undefined;
}

function getStories(whatsOnData) {
  const data = findNodeData(whatsOnData, (nodeData) =>
    Array.isArray(nodeData?.events?.data?.stories),
  );
  if (!data) {
    throw new Error(
      `Unable to find the events in ${attributes.url} — the page structure may have changed`,
    );
  }
  return data.events.data.stories;
}

function getEventStory(eventData, slug) {
  const data = findNodeData(eventData, (nodeData) => nodeData?.story?.content);
  if (!data) {
    throw new Error(
      `Unable to find the event in ${attributes.domain}/${slug} — the page structure may have changed`,
    );
  }
  return data.story;
}

const isFilm = ({ content }) =>
  content?.type?.some(({ slug }) => slug === "film") ?? false;

module.exports = { getStories, getEventStory, isFilm };

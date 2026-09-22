// Luma stores a description as a ProseMirror document rather than HTML or
// text, so the only way to read one is to walk it. Every node that carries
// prose is a `text` node somewhere under `content`; marks (bold, italic,
// links) hang off those nodes and change nothing we read.
function getDescriptionText(descriptionMirror) {
  const parts = [];

  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(descriptionMirror);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

module.exports = { getDescriptionText };

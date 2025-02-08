const normalizeName = (name) =>
  name
    .toLowerCase()
    .replace(", jr.", "")
    .replace("mehrotra jenkins", "mehrotra")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "")
    .replace(/\./g, "");

module.exports = normalizeName;

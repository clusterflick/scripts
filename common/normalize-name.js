const normalizeName = (name) =>
  name
    .toLowerCase()
    .replace(/,? jr\./i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "")
    .replace(/ ([^)]+)$/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .trim();

module.exports = normalizeName;

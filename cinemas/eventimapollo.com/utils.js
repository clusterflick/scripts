// The venue tags each listing with the text its own search filters on, and a
// film carries "film" in it. Shared with the health probe, which counts the
// same entries the retrieve opens.
const isFilmEntry = ($entry) => {
  const searchText = $entry.attr("data-search-text");
  return !!searchText && searchText.toLowerCase().includes("film");
};

module.exports = { isFilmEntry };

// Screening links are the film slug suffixed with the screening id, e.g.
// "/uk/london/stratford/screenings/interstellar-2972". Dropping the id groups
// every screening of the same film together.
const getFilmSlug = (href) => href.split("/").pop().replace(/-\d+$/, "");

module.exports = { getFilmSlug };

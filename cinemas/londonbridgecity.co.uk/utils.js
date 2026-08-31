// The estate's what's-on covers everything it puts on by the river; its film
// screenings are the entries whose copy invites you to catch a movie. Shared
// with the health probe, which counts the same entries the retrieve opens.
const FILM_ENTRY_TEXT = "Catch a movie";

const isFilmEntry = ($entry) => $entry.text().includes(FILM_ENTRY_TEXT);

module.exports = { FILM_ENTRY_TEXT, isFilmEntry };

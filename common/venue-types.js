/**
 * The closed vocabularies for a venue's `type` and `programming` attributes.
 *
 * `type` describes the place. `programming` describes how film gets on there,
 * and is what the website's cinemas / small-screenings presets read. They are
 * deliberately independent: a venue can be retyped for descriptive accuracy
 * without silently moving between presets, which is what happened while the
 * presets keyed off `type` directly.
 */

/** What the place is. Sorted as displayed — the website groups venues by this. */
const VENUE_TYPES = [
  "Arts Centre",
  "Café & Restaurant",
  "Cinema",
  "Community Centre",
  "Community Cinema",
  "Creative Space",
  "Cultural Centre",
  "Food Hall & Market",
  "Gallery",
  "Hotel",
  "Library & Archive",
  "Museum",
  "Music Venue",
  "Other",
  "Park & Outdoor Space",
  "Place of Worship",
  "Pub & Bar",
  "Screening Room",
  "Shop",
  "Theatre",
  "University & College",
];

/**
 * How film gets on at the venue.
 *
 * - `cinema` — the venue *is* a cinema: permanent screen(s), a published
 *   schedule, showing films is its main business.
 * - `venue`  — a substantial programmed venue (theatre, concert hall, arts
 *   centre, gallery) where film is part of a wider programme.
 * - `host`   — everywhere else, including community cinema, pop-ups and pub
 *   film clubs. Not a judgement about quality — these are the small screenings.
 */
const VENUE_PROGRAMMING = ["cinema", "venue", "host"];

module.exports = { VENUE_TYPES, VENUE_PROGRAMMING };

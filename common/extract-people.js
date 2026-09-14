const nlp = require("compromise");

// A run of capitalised words carrying a possessive - "Jane Austen's", "Spike
// Lee's". Under `stripAttributions` the whole phrase goes before the NLP sees
// it: whoever owns the work is being credited for the source material, not
// billed in this production.
//
// Removing it also takes out a fragment the NLP leaves behind. Compromise only
// recognises a possessive as part of a name when it knows the name, so
// "Spike Lee's" comes back whole while "Jane Austen's" comes back as the bare
// given name "Jane" - and a mononym that short is not an identity. Fed to
// TheMovieDB as a crew hint, "jane" compared as similar to "anglee" and every
// Forest Cinema screening of the 2026 Sense and Sensibility matched Ang Lee's
// 1995 one.
//
// The trailing "s" is required rather than optional so that an apostrophe
// inside a name - "O'Brien", "D'Angelo" - is not read as the possessive and
// the name chopped in half.
const POSSESSIVE_ATTRIBUTION =
  /\p{Lu}[\p{L}\p{M}\p{N}'’.-]*(?:\s+\p{Lu}[\p{L}\p{M}\p{N}'’.-]*)*['’]s\b/gu;

/**
 * Extract person names from text using NLP.
 *
 * Always deduplicates and cleans trailing punctuation/possessives from names.
 * Returns undefined when no people are found.
 *
 * @param {string} text - The text to extract names from (e.g. a synopsis).
 * @param {object} [options]
 * @param {boolean} [options.stripAttributions=false] - Strip credited role
 *   lines (e.g. "by Arthur Miller", "Directed by Ivo Van Hove"), possessive
 *   credits (e.g. "Jane Austen's") and parenthetical content (e.g. "(Breaking
 *   Bad)") before running NLP, to avoid extracting playwrights/directors/
 *   designers or treating film/show titles as person names.
 * @returns {string[] | undefined}
 */
function extractPeopleNames(text, { stripAttributions = false } = {}) {
  if (!text) return undefined;

  let cleaned = text;

  if (stripAttributions) {
    cleaned = cleaned
      .replace(
        /^(?:by|directed by|design by|written by|adapted by)\s+.+$/gim,
        "",
      )
      .replace(POSSESSIVE_ATTRIBUTION, "")
      .replace(/\([^)]*\)/g, "");
  }

  const doc = nlp(cleaned);
  const people = doc.people().json();
  if (people.length === 0) return;

  const names = [
    ...new Set(
      people
        .map(({ text }) =>
          text
            .replace(/[''\u2019]s$/i, "")
            .replace(/[?,.]+$/g, "")
            .replace(/,/g, "")
            .trim(),
        )
        .filter(
          (name) =>
            name && !name.includes("\u2019s") && !name.includes("\u2018s"),
        ),
    ),
  ];

  return names.length > 0 ? names : undefined;
}

/**
 * Extract names from inside parentheses in NLP person matches.
 *
 * For synopses in the format "Actor Name (Character Name)", this returns
 * the character names. e.g. "Ryan Gosling (Ken)" -> "Ken".
 *
 * Returns undefined when no bracketed names are found.
 *
 * @param {string} text - The text to extract bracketed names from.
 * @returns {string[] | undefined}
 */
function extractBracketedNames(text) {
  if (!text) return undefined;

  const doc = nlp(text);
  const people = doc.people().json();
  if (people.length === 0) return;

  const names = people.reduce((acc, { text }) => {
    const match = text.trim().match(/^[^(]+\s+\(([^)]+)\)/i);
    return match ? acc.concat(match[1].trim()) : acc;
  }, []);

  return names.length > 0 ? names : undefined;
}

module.exports = { extractPeopleNames, extractBracketedNames };

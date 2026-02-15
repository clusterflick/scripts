const nlp = require("compromise");

/**
 * Extract person names from text using NLP.
 *
 * Always deduplicates and cleans trailing punctuation/possessives from names.
 * Returns undefined when no people are found.
 *
 * @param {string} text - The text to extract names from (e.g. a synopsis).
 * @param {object} [options]
 * @param {boolean} [options.stripAttributions=false] - Strip credited role
 *   lines (e.g. "by Arthur Miller", "Directed by Ivo Van Hove") and
 *   parenthetical content (e.g. "(Breaking Bad)") before running NLP, to
 *   avoid extracting playwrights/directors/designers or treating film/show
 *   titles as person names.
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

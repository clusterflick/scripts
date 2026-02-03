/**
 * Centralized exports for all cinema modules.
 *
 * This module provides:
 * - getAllCinemaNames(): Returns an array of all cinema directory names
 * - getAllCinemaAttributes(): Returns an array of all cinema attributes
 * - getCinema(name): Returns the full cinema module (attributes, retrieve, transform)
 * - getCinemaAttributes(name): Returns just the attributes for a specific cinema
 */

const fs = require("node:fs");
const path = require("node:path");

const cinemasPath = __dirname;

// Cache for cinema names
let _cinemaNames = null;

/**
 * Get all cinema directory names (synchronously for require-time usage)
 * @returns {string[]} Array of cinema directory names
 */
function getAllCinemaNames() {
  if (_cinemaNames === null) {
    _cinemaNames = fs
      .readdirSync(cinemasPath)
      .filter((file) => {
        const filePath = path.join(cinemasPath, file);
        return (
          fs.statSync(filePath).isDirectory() &&
          fs.existsSync(path.join(filePath, "index.js"))
        );
      })
      .sort();
  }
  return _cinemaNames;
}

/**
 * Get the full cinema module (attributes, retrieve, transform)
 * @param {string} name - Cinema directory name
 * @returns {Object} Cinema module
 */
function getCinema(name) {
  return require(path.join(cinemasPath, name));
}

/**
 * Get just the attributes for a specific cinema
 * @param {string} name - Cinema directory name
 * @returns {Object} Cinema attributes
 */
function getCinemaAttributes(name) {
  return getCinema(name).attributes;
}

/**
 * Get all cinema attributes as an array
 * @returns {Array} Array of cinema attributes objects
 */
function getAllCinemaAttributes() {
  return getAllCinemaNames().map((name) => getCinemaAttributes(name));
}

module.exports = {
  getAllCinemaNames,
  getAllCinemaAttributes,
  getCinema,
  getCinemaAttributes,
};

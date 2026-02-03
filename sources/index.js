/**
 * Centralized exports for all source modules.
 *
 * This module provides:
 * - getAllSourceNames(): Returns an array of all source directory names
 * - getSource(name): Returns the full source module (attributes, retrieve, findEvents)
 * - getSourceAttributes(name): Returns just the attributes for a specific source
 * - getSourceFindEvents(name): Returns the findEvents function for a specific source
 * - getSourceDiscoverVenues(name): Returns the discoverVenues function (if available)
 */

const fs = require("node:fs");
const path = require("node:path");

const sourcesPath = __dirname;

// Cache for source names
let _sourceNames = null;

/**
 * Get all source directory names (synchronously for require-time usage)
 * @returns {string[]} Array of source directory names
 */
function getAllSourceNames() {
  if (_sourceNames === null) {
    _sourceNames = fs
      .readdirSync(sourcesPath)
      .filter((file) => {
        const filePath = path.join(sourcesPath, file);
        return (
          fs.statSync(filePath).isDirectory() &&
          fs.existsSync(path.join(filePath, "index.js"))
        );
      })
      .sort();
  }
  return _sourceNames;
}

/**
 * Get the full source module (attributes, retrieve, findEvents)
 * @param {string} name - Source directory name
 * @returns {Object} Source module
 */
function getSource(name) {
  return require(path.join(sourcesPath, name));
}

/**
 * Get just the attributes for a specific source
 * @param {string} name - Source directory name
 * @returns {Object} Source attributes
 */
function getSourceAttributes(name) {
  return getSource(name).attributes;
}

/**
 * Get the findEvents function for a specific source
 * @param {string} name - Source directory name
 * @returns {Function} findEvents function
 */
function getSourceFindEvents(name) {
  return getSource(name).findEvents;
}

/**
 * Get the discoverVenues function for a specific source (if available)
 * @param {string} name - Source directory name
 * @returns {Function|undefined} discoverVenues function or undefined
 */
function getSourceDiscoverVenues(name) {
  try {
    return require(path.join(sourcesPath, name, "discover-venues"));
  } catch {
    return undefined;
  }
}

module.exports = {
  getAllSourceNames,
  getSource,
  getSourceAttributes,
  getSourceFindEvents,
  getSourceDiscoverVenues,
};

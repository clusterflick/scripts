const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("./schema.json");
const { checkSourceTier } = require("./source-policy");
const { quoteAppearsIn } = require("./page-text");

const VENUE_FIELDS = [
  "entrance_step_free",
  "alt_accessible_entrance",
  "lift",
  "accessible_toilet",
  "changing_places",
  "assistance_dogs",
  "quiet_space",
  "hearing_assist_counters",
];

const SCREEN_FIELDS = [
  "step_free",
  "wheelchair_spaces",
  "space_position",
  "transfer_seating",
  "hearing_assist",
];

/**
 * The venues that get an accessibility record: those where film is the
 * programme (`cinema`) or a regular part of it (`venue`). A `host` venue only
 * lets other people's screenings in now and then, and is out of scope.
 *
 * @param {object} attributes - A venue's attributes
 * @returns {boolean}
 */
const isInScope = (attributes) =>
  attributes.programming === "cinema" || attributes.programming === "venue";

let compiled;
const getSchemaValidator = () => {
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    compiled = ajv.compile(schema);
  }
  return compiled;
};

/**
 * Every field object in a record, with where it sits, for the rule checks.
 *
 * @param {object} record
 * @returns {Array<{ path: string, key: string, screen: object|null, field: object }>}
 */
function getFields(record) {
  const fields = VENUE_FIELDS.map((key) => ({
    path: key,
    key,
    screen: null,
    field: record[key],
  }));
  record.screens.forEach((screen, index) => {
    SCREEN_FIELDS.forEach((key) => {
      fields.push({
        path: `screens[${index}] (${screen.name}).${key}`,
        key,
        screen,
        field: screen[key],
      });
    });
  });
  return fields;
}

function checkField({ path, key, screen, field }, attributes, errors) {
  const fail = (message) => errors.push(`${path}: ${message}`);
  const known = field.status !== "unknown";

  // Rule 1: never infer. A status other than unknown is a claim a source made.
  if (known && field.sources.length === 0) {
    fail(`status "${field.status}" has no source`);
  }

  // Rule 3: the last report found only stands in for a status we don't have.
  if (field.last_found && known) {
    fail("last_found is only for a field whose status is unknown");
  }

  // Rule 2 and the source policy: each source at a tier its host allows.
  field.sources.forEach((source) => {
    const problem = checkSourceTier(source.url, source.tier, attributes);
    if (problem) fail(problem);
    // Rule 5: a chain-wide policy can't say anything about one screen.
    if (screen && source.chain_wide) {
      fail(`a screen fact needs a venue-specific source, not ${source.url}`);
    }
  });
  if (field.last_found) {
    const problem = checkSourceTier(
      field.last_found.url,
      field.last_found.tier,
      attributes,
    );
    if (problem) fail(`last_found: ${problem}`);
  }

  if (key === "wheelchair_spaces") {
    if (field.count !== null && !known) {
      fail("count given for an unknown status");
    }
    if (field.count > 0 && field.status === "no") {
      fail(`count ${field.count} contradicts status "no"`);
    }
    if (field.count === 0 && field.status === "yes") {
      fail('count 0 contradicts status "yes"');
    }
  }
  if (key === "space_position" && !known && field.value !== "unknown") {
    fail(`value "${field.value}" given for an unknown status`);
  }
}

/**
 * Whether a record is well formed and keeps the source rules. These hold for
 * every record, verified or not - a draft that breaks them is wrong already,
 * not just unfinished.
 *
 * @param {object} record - A venue accessibility record
 * @param {object} attributes - The venue's attributes
 * @returns {string[]} What's wrong, empty if nothing
 */
function validateRecord(record, attributes) {
  const validateSchema = getSchemaValidator();
  if (!validateSchema(record)) {
    return validateSchema.errors.map(
      (error) => `${error.instancePath || "/"} ${error.message}`,
    );
  }
  const errors = [];
  if (record.id !== attributes.id) {
    errors.push(`id "${record.id}" is not the venue's id "${attributes.id}"`);
  }
  if (!isInScope(attributes)) {
    errors.push(
      `venue programming is "${attributes.programming}", which is out of scope`,
    );
  }
  const names = record.screens.map((screen) => screen.name);
  const repeated = names.filter((name, i) => names.indexOf(name) !== i);
  if (repeated.length) {
    errors.push(`screen names repeated: ${[...new Set(repeated)].join(", ")}`);
  }
  getFields(record).forEach((entry) => checkField(entry, attributes, errors));
  return errors;
}

/**
 * What still stands between a record and the website. Only a verified record
 * is published, and a verified record must carry a quote for every source.
 *
 * Conflicts don't block publication - the page shows both sources - but they
 * do block approval: a conflict that reaches the page was looked at by someone.
 *
 * @param {object} record - A record that passes validateRecord
 * @returns {string[]}
 */
function getPublicationBlockers(record) {
  const blockers = [];
  if (!record.verified) blockers.push("not verified");
  getFields(record).forEach(({ path, field }) => {
    field.sources.forEach((source) => {
      // Rule 6: every fact needs a quote.
      if (!source.quote) blockers.push(`${path}: no quote from ${source.url}`);
    });
  });
  return blockers;
}

/**
 * The quotes that no longer appear on the page they cite.
 *
 * @param {object} record
 * @param {(url: string) => string|undefined} getText - A fetched page's text,
 *   or undefined if it wasn't fetched
 * @returns {string[]}
 */
function findMissingQuotes(record, getText) {
  const missing = [];
  getFields(record).forEach(({ path, field }) => {
    field.sources.forEach((source) => {
      if (!source.quote) return;
      const text = getText(source.url);
      if (text === undefined) {
        missing.push(`${path}: ${source.url} wasn't fetched`);
      } else if (!quoteAppearsIn(source.quote, text)) {
        missing.push(`${path}: quote not found on ${source.url}`);
      }
    });
  });
  return missing;
}

/**
 * Check every record against the venues it describes, and that every venue in
 * scope has one. A venue added to the listings with no record would otherwise
 * show no accessibility section without anyone deciding that.
 *
 * @param {object[]} records - Every venue accessibility record
 * @param {object[]} allAttributes - Every venue's attributes
 * @returns {{ errors: string[] }}
 */
function validateAll(records, allAttributes) {
  const byId = new Map(allAttributes.map((a) => [a.id, a]));
  const errors = [];
  const seen = new Set();
  records.forEach((record) => {
    const attributes = byId.get(record.id);
    if (!attributes) {
      errors.push(`${record.id}: no venue has this id`);
      return;
    }
    if (seen.has(record.id)) errors.push(`${record.id}: more than one record`);
    seen.add(record.id);
    validateRecord(record, attributes).forEach((error) =>
      errors.push(`${record.id}: ${error}`),
    );
  });
  allAttributes
    .filter((attributes) => isInScope(attributes) && !seen.has(attributes.id))
    .forEach((attributes) =>
      errors.push(`${attributes.id}: in scope but has no record`),
    );
  return { errors };
}

module.exports = {
  VENUE_FIELDS,
  SCREEN_FIELDS,
  isInScope,
  getFields,
  validateRecord,
  validateAll,
  getPublicationBlockers,
  findMissingQuotes,
};

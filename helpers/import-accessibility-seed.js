// Turn the desk-research seed into accessibility records and a source registry.
//
//   node helpers/import-accessibility-seed.js <venue-accessibility-seed.json>
//
// A one-off: the seed came from research done before the records existed, and
// is keyed by the website's venue slug, which is derived from the venue's name
// and changes when the name does. Records are keyed by venue id instead. Seed
// entries are matched to venues by exact name, and an entry matching no venue
// or more than one fails the import rather than guessing.
//
// What gets written:
//   accessibility/venues/<id>.json  one record per venue in scope, the seed's
//                                   where it has one and an all-unknown stub
//                                   where it doesn't
//   accessibility/sources.json      every page the seed cites, per venue, plus
//                                   the Picturehouse access page every
//                                   Picturehouse has
//
// Nothing is verified. The seed captured no quotes, so every record imports
// with `verified: false` and every source with `quote: null`, and
// getPublicationBlockers keeps all of it off the website until each fact has
// been checked against its page.
//
// An existing record is never overwritten: the import only fills gaps, so it
// can't undo a review.

const fs = require("node:fs");
const path = require("node:path");
const { getAllCinemaNames, getCinemaAttributes } = require("../cinemas");
const { writeJSON } = require("../common/utils");
const {
  VENUE_FIELDS,
  SCREEN_FIELDS,
  isInScope,
  validateAll,
} = require("../common/accessibility/validate");
const {
  VENUES_DIRECTORY,
  SOURCES_PATH,
  getRecordPath,
} = require("../common/accessibility/records");
const {
  classifySource,
  hostOf,
} = require("../common/accessibility/source-policy");

// Seed keys that are derived from the venue's attributes, so a record would
// only hold a copy that drifts.
const DERIVED_KEYS = ["slug", "name", "kind", "clusterflick_url"];

// The element holding the access copy on a Picturehouse page; the rest of the
// page is the chain template, film carousel included.
const PICTUREHOUSE_SELECTOR = ".cinimaAccessibility_div";

const unknownField = () => ({
  status: "unknown",
  note: null,
  sources: [],
  conflict: null,
  last_found: null,
});

const stubScreenFields = (key) => {
  if (key === "wheelchair_spaces") return { ...unknownField(), count: null };
  if (key === "space_position") return { ...unknownField(), value: "unknown" };
  return unknownField();
};

const stubRecord = (id) => ({
  id,
  access_page_url: null,
  access_contact: null,
  coverage: "not_started",
  verified: false,
  researched_on: null,
  notes: null,
  ...Object.fromEntries(VENUE_FIELDS.map((key) => [key, unknownField()])),
  screens: [],
});

// A field the seed gave a value of another field's kind - a count under
// step_free, a position under wheelchair_spaces - was filed under the wrong
// key, and which key it meant is a guess. So the field is reset to unknown,
// and what the seed said goes in the screen's notes for whoever checks it.
const misfiledKeys = (key, field) => {
  const allowed = Object.keys(stubScreenFields(key));
  return Object.keys(field).filter((name) => !allowed.includes(name));
};

const describeMisfiled = (key, field, extra) =>
  `Seed research put ${extra
    .map((name) => `${name} ${JSON.stringify(field[name])}`)
    .join(" and ")} under ${key} (status "${field.status}"${
    field.note ? `, note "${field.note}"` : ""
  }, from ${field.sources.map((source) => source.url).join(", ") || "no source"}); ` +
  "check which field it belongs to.";

// The seed leaves `count` and `value` off fields it found nothing for.
const fromSeedScreen = (screen) => {
  const notes = screen.notes ? [screen.notes] : [];
  const fields = SCREEN_FIELDS.map((key) => {
    const field = screen[key];
    const extra = misfiledKeys(key, field);
    if (extra.length) {
      notes.push(describeMisfiled(key, field, extra));
      return [key, stubScreenFields(key)];
    }
    return [key, { ...stubScreenFields(key), ...field }];
  });
  return {
    ...screen,
    ...Object.fromEntries(fields),
    notes: notes.length ? notes.join(" ") : null,
  };
};

const fromSeed = (id, entry) => {
  const record = { ...entry, id };
  DERIVED_KEYS.forEach((key) => delete record[key]);
  record.verified = false;
  record.screens = entry.screens.map(fromSeedScreen);
  return record;
};

const citedSources = (record) => {
  const byUrl = new Map();
  const add = (url, tier) => {
    const current = byUrl.get(url);
    if (!current || tier < current.tier) byUrl.set(url, { url, tier });
  };
  const visit = (field) => {
    field.sources.forEach((source) => add(source.url, source.tier));
    if (field.last_found) add(field.last_found.url, field.last_found.tier);
  };
  VENUE_FIELDS.forEach((key) => visit(record[key]));
  record.screens.forEach((screen) =>
    SCREEN_FIELDS.forEach((key) => visit(screen[key])),
  );
  return [...byUrl.values()];
};

(async () => {
  const [seedPath] = process.argv.slice(2);
  if (!seedPath) throw new Error("No seed file given");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

  const venues = getAllCinemaNames().map(getCinemaAttributes);
  const inScope = venues.filter(isInScope);

  const seedById = new Map();
  for (const entry of seed.venues) {
    const matches = venues.filter((venue) => venue.name === entry.name);
    if (matches.length !== 1) {
      throw new Error(
        `Seed entry "${entry.name}" (${entry.slug}) matches ${matches.length} venues`,
      );
    }
    const [{ id }] = matches;
    if (seedById.has(id)) throw new Error(`Two seed entries for ${id}`);
    seedById.set(id, entry);
  }

  const records = inScope.map((venue) =>
    seedById.has(venue.id)
      ? fromSeed(venue.id, seedById.get(venue.id))
      : stubRecord(venue.id),
  );
  const outOfScope = [...seedById.keys()].filter(
    (id) => !inScope.some((venue) => venue.id === id),
  );
  if (outOfScope.length) {
    throw new Error(`Seed entries out of scope: ${outOfScope.join(", ")}`);
  }

  const { errors } = validateAll(records, venues);
  if (errors.length) {
    throw new Error(
      `The imported records don't validate:\n${errors.join("\n")}`,
    );
  }

  fs.mkdirSync(VENUES_DIRECTORY, { recursive: true });
  let written = 0;
  for (const record of records) {
    const filePath = getRecordPath(record.id);
    if (fs.existsSync(filePath)) continue;
    await writeJSON(filePath, record);
    written += 1;
  }

  const existingSources = fs.existsSync(SOURCES_PATH)
    ? JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"))
    : {};
  const sources = { ...existingSources };
  for (const record of records) {
    if (sources[record.id]) continue;
    const venue = venues.find(({ id }) => id === record.id);
    const entries = citedSources(record);
    if (
      record.access_page_url &&
      !entries.some((entry) => entry.url === record.access_page_url)
    ) {
      const { tier } = classifySource(record.access_page_url, venue);
      if (tier !== 1 && tier !== 2) {
        throw new Error(
          `${record.id}: access page ${record.access_page_url} isn't a tier 1 or 2 source`,
        );
      }
      entries.push({ url: record.access_page_url, tier });
    }
    if (venue.id.startsWith("picturehouses.com-")) {
      const url = `${venue.url}/accessibility`;
      if (!entries.some((entry) => entry.url === url)) {
        entries.push({ url, tier: 1 });
      }
    }
    entries
      .filter((entry) => hostOf(entry.url) === "picturehouses.com")
      .forEach((entry) => {
        entry.selector = PICTUREHOUSE_SELECTOR;
      });
    if (entries.length) sources[record.id] = entries;
  }
  await writeJSON(SOURCES_PATH, sources);

  const seeded = records.filter((record) => seedById.has(record.id)).length;
  console.log(
    `${records.length} venues in scope: ${seeded} from the seed, ${records.length - seeded} stubs. ` +
      `Wrote ${written} records to ${path.relative(process.cwd(), VENUES_DIRECTORY)} ` +
      `and sources for ${Object.keys(sources).length} venues to ${path.relative(process.cwd(), SOURCES_PATH)}.`,
  );
})().catch((error) => {
  console.error(`\n❌ ${error.stack || error.message || error}`);
  process.exit(1);
});

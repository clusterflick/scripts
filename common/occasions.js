// ---------------------------------------------------------------------------
// Occasions - what makes a performance more than a screening: someone in the
// room, a live score, a premiere, a preview.
//
// Shaped like accessibility and format: an object holding only what is
// happening, read from structured listing data, then the title, then the
// description. Unlike them, an occasion can carry detail - who is introducing,
// who is playing the score, where it premieres - so each key is either `true`
// (it is happening, nothing more is known) or an object of details (it is
// happening, and here is who). An object always has at least one detail; an
// empty one would be a second way of writing `true`, so it is normalised away.
//
//   { intro: { guests: ["Benjamin Crais"] }, qAndA: true }
//
// Whether an occasion is *rare* is not decided here. The same words are house
// style at one venue and a one-off at another, and telling them apart means
// looking at the whole city - which is the website's job. This only records
// what the venue said.
//
// Descriptions are read far more cautiously than titles. A title or a
// performance note is about this performance; a description is a page of
// prose about the film, its history and the venue's booking fees, shared by
// every performance of the showing. So a description only contributes a
// sentence that is about the screening itself ("This screening will be
// introduced by ..."), that isn't negated or in the past, and - when it names a
// date - only to the performance on that date. See `getDescriptionOccasions`.
// ---------------------------------------------------------------------------

// The keys and the details each may carry. The schema mirrors this.
const occasionDetails = {
  // Someone introduces the film
  intro: ["guests"],
  // A Q&A after the film (Barbican's "ScreenTalk" included)
  qAndA: ["guests"],
  inConversation: ["guests"],
  panel: ["guests"],
  // Someone appears without the listing saying in what form - "in person",
  // "special guest", "masterclass". Dropped when a more specific form of
  // appearance is also found, since it then adds nothing.
  guestAppearance: ["guests"],
  // Musicians playing along with the film
  liveScore: ["performers"],
  premiere: ["region"],
  preview: [],
};

const premiereRegions = ["uk", "london", "european", "world", "international"];

const appearanceKeys = ["intro", "qAndA", "inConversation", "panel"];

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Words which start with a capital but are never the start of a name - mostly
// sentence furniture that follows "with" or "by".
const notANameStart =
  /^(?:the|this|these|that|our|their|his|her|its|a|an|and|with|join|tickets?|please|doors|book|booking|free|special|guests?|q&a|tbc|tba)$/i;

const nameParticle =
  /^(?:de|da|di|du|del|della|der|den|van|von|la|le|al|bin|el|y)$/;

// Words that end a list of names without describing anyone - "Q&A with Mark
// Gatiss *on* ...". Any other lower-case word straight after a capitalised run
// means the run was describing the person, not naming them ("Hitchcock
// *expert* Gary Lewis").
const nameTerminator =
  /^(?:who|from|on|at|in|for|after|before|following|to|will|is|are|about|as|plus|followed|discussing|tonight|today|live|via|whose|where|when|this|that|which|then|also)$/;

// After one of these, a capitalised run is a work or an organisation rather
// than a person: "editor *of* Terminus", "composer *for* Two Times João
// Liberada".
const namePreposition = /^(?:of|for|at|from|with|in|on|to)$/;

// Jobs. A capitalised run ending in one is a job title ("BFI TV Programmer"),
// and one with a job inside it names the person after it ("Award Winning
// Director Gillies MacKinnon", "Writer/Director Robert Eggers").
const roleWord =
  /^(?:co-)?(?:directors?|writers?|producers?|filmmakers?|film-makers?|curators?|composers?|actors?|actress(?:es)?|authors?|artists?|editors?|cinematographers?|programmers?|hosts?|stars?|presenters?|critics?|lecturers?|managers?|chair(?:man|woman|person)?|founders?|presidents?|journalists?|historians?|academics?|researchers?|scholars?|organi[sz]ers?|creators?|ceo)$/i;

const isRole = (word) =>
  word.split("/").some((part) => roleWord.test(part.replace(/[,'’]+$/, "")));

// A full stop after an honorific or an initial doesn't end the phrase.
const abbreviation = String.raw`(?<!\b(?:Dr|Prof|Mr|Mrs|Ms|Mx|St|Jr|Sr|Rev|\p{Lu}))\.`;

const isCapitalised = (word) => /^\p{Lu}/u.test(word);

// Up to this many lower-case words may sit between a trigger and a name:
// "introduced by *guest curator* Leo Krenzer", "a Q&A with *director* Poh Si
// Teng". More than that and the sentence has moved on.
const MAX_DESCRIPTOR_WORDS = 4;
const MAX_NAME_WORDS = 5;

// Text after a trigger ("Q&A with ") is cut at the first thing that ends the
// phrase - and a parenthesis, so "James Wilson (producer) and Harry Davies"
// keeps only the name the phrase is sure of.
const phraseEnd = new RegExp(
  String.raw`${abbreviation}|[;:!?\n|+()[\]{}"“”]|\s[-–—]\s|\s[–—]|[–—]\s|\s['‘]`,
  "u",
);

// A capitalised run as a person's name, or null if it isn't one. A single word
// is rejected: it is as often a work, a place or a role ("Cocaine", "Judge")
// as a first name, and the guest list is better short than wrong.
const toPerson = (run) => {
  let words = [...run];
  const lastRole = words.findLastIndex(isRole);
  if (lastRole === words.length - 1) return null;
  if (lastRole >= 0) words = words.slice(lastRole + 1);
  const name = words
    .join(" ")
    .replace(/['’]s$/, "")
    .trim();
  if (words.length < 2 || words.length > MAX_NAME_WORDS) return null;
  return name;
};

// Every person named in the phrase following a trigger, as the venue wrote
// them.
const getNames = (text) => {
  const tokens = text
    .split(phraseEnd)[0]
    .replace(/,/g, " , ")
    .split(/\s+/)
    .filter(Boolean);

  const names = [];
  let run = [];
  // The run follows a preposition, so names a work or organisation.
  let runIsWork = false;
  let afterPreposition = false;
  let descriptors = 0;
  // Set by a comma, until the next "and": what follows is either another
  // name in a list or an apposition - "David Jenkins, editor of Little White
  // Lies" - which describes the name before it, and ends the list.
  let afterComma = false;
  let segmentStart = 0;

  const endRun = () => {
    const person = run.length > 0 && !runIsWork ? toPerson(run) : null;
    if (person) names.push(person);
    run = [];
    runIsWork = false;
  };

  for (const [index, token] of tokens.entries()) {
    if (token === ",") {
      endRun();
      afterComma = true;
      segmentStart = names.length;
      descriptors = 0;
      afterPreposition = false;
      continue;
    }

    if (/^(?:and|&)$/i.test(token)) {
      endRun();
      descriptors = 0;
      afterPreposition = false;
      continue;
    }

    const next = tokens[index + 1] || "";
    if (
      isCapitalised(token) ||
      (run.length > 0 && nameParticle.test(token) && isCapitalised(next))
    ) {
      if (run.length === 0) {
        if (notANameStart.test(token)) break;
        runIsWork = afterPreposition;
        afterPreposition = false;
      }
      run.push(token);
      continue;
    }

    if (run.length > 0) {
      if (nameTerminator.test(token)) {
        endRun();
        break;
      }
      // The run was describing someone rather than naming them.
      run = [];
      runIsWork = false;
      if (afterComma) {
        names.length = segmentStart;
        break;
      }
      descriptors = 1;
      afterPreposition = namePreposition.test(token);
      continue;
    }

    if (afterComma) break;
    descriptors++;
    if (descriptors > MAX_DESCRIPTOR_WORDS) break;
    afterPreposition = namePreposition.test(token);
  }
  endRun();

  return [...new Set(names)];
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// An introduction or Q&A that was recorded plays wherever the film does, so it
// is programming rather than someone in the room. "recordered" is a real
// listing's spelling.
const notInTheRoom =
  /pre-?recorded|\brecord\w*\s+(?:intro|introduction|message|q\s*&\s*a|q\s*and\s*a|conversation)|\b(?:video|filmed|virtual|online|zoom)\s+(?:intro|introduction|message|q\s*&\s*a|q\s*and\s*a)/i;

// Chain "preview" pricing and membership perks describe a ticket, not an event.
const routinePreview =
  /members|membership|£\s?\d|priority booking|discounted|unlimited card/i;

const qAndA = String.raw`(?:q\s*&\s*a|q\s*and\s*a|screen\s?talk)`;

// Each rule finds one key. `names` names the detail its trailing phrase fills;
// rules for the same key are tried in order and the first to match wins, so a
// named rule is listed before the bare one it refines.
const rules = [
  {
    key: "liveScore",
    pattern:
      /\blive (?:score|music|accompaniment|soundtrack)\s+(?:by|from|with|performed by)\s+/i,
    names: "performers",
  },
  {
    key: "liveScore",
    pattern:
      /\b(?:score|music|soundtrack)\s+(?:performed|played)\s+live\s+(?:by|from)\s+/i,
    names: "performers",
  },
  {
    key: "liveScore",
    pattern:
      /\blive (?:score|scored|music|accompaniment|band|orchestra|soundtrack)\b|\b(?:score|music|soundtrack)\s+(?:performed|played)\s+live\b/i,
  },

  {
    key: "qAndA",
    pattern: new RegExp(
      String.raw`\b${qAndA}\s+(?:with|w\/|from|featuring|by)\s+`,
      "i",
    ),
    names: "guests",
    unless: notInTheRoom,
  },
  {
    key: "qAndA",
    pattern: new RegExp(String.raw`\b${qAndA}(?![\p{L}])`, "iu"),
    unless: notInTheRoom,
  },

  {
    key: "inConversation",
    pattern: /\bin conversation with\s+/i,
    names: "guests",
    unless: notInTheRoom,
  },
  {
    key: "inConversation",
    pattern: /\bin conversation\b/i,
    unless: notInTheRoom,
  },

  {
    key: "panel",
    pattern: /\bpanel(?: discussion| talk)?\s+(?:with|featuring)\s+/i,
    names: "guests",
    unless: notInTheRoom,
  },
  {
    key: "panel",
    pattern: /\bpanel (?:discussions?|talks?)\b/i,
    unless: notInTheRoom,
  },

  {
    key: "intro",
    pattern: /\b(?:intro(?:duction)?s?|introduced)\s+(?:by|from|with)\s+/i,
    names: "guests",
    unless: notInTheRoom,
  },
  {
    key: "intro",
    pattern: /\bintroduc(?:tion|tions|ed)\b|(?:^|[^\p{L}])intros?(?![\p{L}])/iu,
    unless: notInTheRoom,
  },

  {
    key: "guestAppearance",
    pattern: /\bspecial guests?\s+(?:appearance\s+)?(?:from\s+|by\s+)?/i,
    names: "guests",
    unless: notInTheRoom,
  },
  {
    key: "guestAppearance",
    pattern:
      /\bin (?:person|attendance)\b|\bspecial guests?\b|\bmasterclass\b/i,
    unless: notInTheRoom,
  },

  {
    key: "premiere",
    pattern:
      /\b(uk|european|world|london|british|international)\s+premi[eè]re\b/i,
    region: (match) => {
      const region = match[1].toLowerCase();
      return region === "british" ? "uk" : region;
    },
  },

  {
    key: "preview",
    pattern: /\bpreview\b/i,
    unless: routinePreview,
  },
];

// One cheap test every rule implies, so text that says nothing but a film's
// name costs one pass rather than a dozen.
const anySignal =
  /q\s*&\s*a|q\s*and\s*a|screen\s?talk|intro|live|premi[eè]re|preview|conversation|in person|attendance|panel|masterclass|special guest/i;

// The occasions one piece of text describes, as an occasions object.
const getTextOccasions = (text = "") => {
  if (!text || !anySignal.test(text)) return {};

  const occasions = {};
  for (const rule of rules) {
    if (occasions[rule.key]) continue;
    if (rule.unless?.test(text)) continue;
    const match = text.match(rule.pattern);
    if (!match) continue;

    if (rule.names) {
      const names = getNames(text.slice(match.index + match[0].length));
      // A trigger with no name after it ("Q&A with tickets on the door") is
      // left to the bare rule for the same key.
      if (names.length === 0) continue;
      occasions[rule.key] = { [rule.names]: names };
    } else if (rule.region) {
      occasions[rule.key] = { region: rule.region(match) };
    } else {
      occasions[rule.key] = true;
    }
  }

  if (appearanceKeys.some((key) => occasions[key])) {
    delete occasions.guestAppearance;
  }
  return occasions;
};

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

// A sentence about the screening itself rather than about the film. Without
// one, "is introduced to an all-boys school" (Dead Poets Society's synopsis)
// is an introduction and "tickets booked in person" (the Barbican's booking
// footer) is a guest.
const screeningCue = new RegExp(
  [
    String.raw`\b(?:this|these|our|tonight's|tonight’s|each|every|all)\s+(?:[\p{L}\p{N}'’.:-]+\s+){0,4}?(?:screenings?|shows?|events?|evenings?|nights?|programmes?|performances?|sessions?)\b`,
    String.raw`\bthe\s+(?:[\p{L}\p{N}'’.:-]+\s+){0,3}?(?:screenings?|performances?)\b`,
    String.raw`\bfollowed by\b`,
    String.raw`\bwill (?:be|feature|include|introduce|join|present|host|perform|accompany|take place)\b`,
    String.raw`\bjoin(?:s|ing)? us\b`,
    String.raw`\bfeatur(?:es|ing)\b`,
    String.raw`\bincludes?\b`,
    String.raw`\b(?:post|pre)[- ]?screening\b`,
    String.raw`\bscreen\s?talk\b`,
    String.raw`\bafter the (?:screening|film)\b`,
  ].join("|"),
  "iu",
);

// "will NOT be in attendance", "who needs no introduction".
const negation =
  /\b(?:not|no|without|won't|wont|cannot|can't|isn't|unfortunately|cancell?ed|postponed|unable)\b/i;

// "Our screening on 5 September, 2024 was introduced by Tony Rayns" - a page
// recalling an earlier event, not advertising this one.
const pastTense = /\b(?:was|were|had)\b/i;

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const monthPattern = String.raw`(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?`;
const ordinal = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const year = String.raw`(?:,?\s+(\d{4}))?`;
// "11 November", "the 22nd of November", "Thursday 5 September, 2024"
const dayMonth = new RegExp(
  String.raw`\b${ordinal}(?:\s+of)?\s+${monthPattern}(?![\p{L}])${year}`,
  "giu",
);
// "December 6th", "Sunday, December 6th"
const monthDay = new RegExp(
  String.raw`\b${monthPattern}\s+${ordinal}(?![\p{L}\p{N}])${year}`,
  "giu",
);

const monthIndex = (name) => months.indexOf(name.slice(0, 3).toLowerCase());

const getDates = (sentence) => [
  ...[...sentence.matchAll(dayMonth)].map((match) => ({
    day: Number(match[1]),
    month: monthIndex(match[2]),
    year: match[3] ? Number(match[3]) : undefined,
  })),
  ...[...sentence.matchAll(monthDay)].map((match) => ({
    day: Number(match[2]),
    month: monthIndex(match[1]),
    year: match[3] ? Number(match[3]) : undefined,
  })),
];

const londonDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

const getLondonDate = (date) => {
  const parts = Object.fromEntries(
    londonDate.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    day: Number(parts.day),
    month: Number(parts.month) - 1,
    year: Number(parts.year),
  };
};

const toSentences = (description) =>
  description
    .split(
      new RegExp(
        String.raw`\n+|(?<=${abbreviation}|[!?])\s+(?=["“‘]?\p{Lu})`,
        "u",
      ),
    )
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);

// Whether a sentence of the description speaks about this performance.
//
// A sentence naming a date is about the performance on that date, and about
// none if no performance falls on it - a past event the page recalls, or
// another night of the run. One naming no date is about every performance of
// the showing. Venues name the night when only one is special ("The screening
// on 11 November will be introduced by ..."), and a page written as though for
// a single screening ("This performance will feature a live score") is
// usually about each of them.
const isAboutPerformance = (sentence, { date }) => {
  const dates = getDates(sentence);
  if (dates.length === 0) return true;

  const performance = getLondonDate(date);
  return dates.some(
    (mentioned) =>
      mentioned.day === performance.day &&
      mentioned.month === performance.month &&
      (mentioned.year === undefined || mentioned.year === performance.year),
  );
};

const getDescriptionOccasions = (description, context) => {
  if (!description || !anySignal.test(description)) return {};

  return toSentences(description)
    .filter((sentence) => anySignal.test(sentence))
    .filter((sentence) => screeningCue.test(sentence))
    .filter((sentence) => !negation.test(sentence))
    .filter((sentence) => !pastTense.test(sentence))
    .filter((sentence) => isAboutPerformance(sentence, context))
    .map((sentence) => getTextOccasions(sentence))
    .reduce((merged, occasions) => mergeOccasions(merged, occasions), {});
};

// ---------------------------------------------------------------------------
// Combining
// ---------------------------------------------------------------------------

const unique = (values) => [...new Set(values)];

// Combine two readings of the same key. Presence is never in dispute - either
// says it is happening - so this only decides the details: the higher
// priority reading's come first, and a bare `true` never erases details the
// other found.
const mergeValue = (lower, higher) => {
  if (!lower) return higher;
  if (!higher) return lower;
  if (higher === true) return lower;
  if (lower === true) return higher;

  const merged = { ...lower, ...higher };
  for (const field of ["guests", "performers"]) {
    if (lower[field] || higher[field]) {
      merged[field] = unique([
        ...(higher[field] || []),
        ...(lower[field] || []),
      ]);
    }
  }
  return merged;
};

const mergeOccasions = (lower = {}, higher = {}) => {
  const merged = { ...lower };
  for (const [key, value] of Object.entries(higher)) {
    merged[key] = mergeValue(lower[key], value);
  }
  if (appearanceKeys.some((key) => merged[key])) {
    delete merged.guestAppearance;
  }
  return merged;
};

// Structured listing data, checked rather than trusted: an unknown key or
// detail is a mistake in the venue's transform, not something to drop
// quietly. `false` and `undefined` are dropped, as createAccessibility drops
// them, so a venue can write `{ qAndA: tags.includes("qa") }`.
const getValidOccasions = (occasions = {}) => {
  const valid = {};
  for (const [key, value] of Object.entries(occasions)) {
    if (!(key in occasionDetails)) {
      throw new Error(`createOccasions: unknown occasion "${key}"`);
    }
    if (value === undefined || value === false) continue;
    if (value === true) {
      valid[key] = true;
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `createOccasions: "${key}" must be true or an object of details`,
      );
    }

    const details = {};
    for (const [field, detail] of Object.entries(value)) {
      if (!occasionDetails[key].includes(field)) {
        throw new Error(`createOccasions: "${key}" has no detail "${field}"`);
      }
      if (field === "region") {
        if (!premiereRegions.includes(detail)) {
          throw new Error(`createOccasions: unknown premiere region ${detail}`);
        }
        details.region = detail;
        continue;
      }
      const names = unique(
        (detail || []).map((name) => `${name}`.trim()).filter(Boolean),
      );
      if (names.length > 0) details[field] = names;
    }
    valid[key] = Object.keys(details).length > 0 ? details : true;
  }
  return valid;
};

// Structured listing data is most reliable, then the title, then the
// description. A description needs the performance's `date`, to pin a
// sentence naming one night to that night.
const createOccasions = (
  title = "",
  occasions = {},
  description = "",
  context,
) => {
  const hasDescription = !!description?.trim();
  if (
    hasDescription &&
    (!(context?.date instanceof Date) || Number.isNaN(context.date.getTime()))
  ) {
    throw new Error(
      "createOccasions: a description needs the performance's { date } to know which sentences describe it",
    );
  }

  return [
    hasDescription ? getDescriptionOccasions(description, context) : {},
    getTextOccasions(title.trim()),
    getValidOccasions(occasions),
  ].reduce((merged, next) => mergeOccasions(merged, next), {});
};

module.exports = {
  occasionDetails,
  premiereRegions,
  getNames,
  getTextOccasions,
  mergeOccasions,
  createOccasions,
};

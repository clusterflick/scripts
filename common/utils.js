const crypto = require("node:crypto");
const fs = require("node:fs").promises;
const path = require("node:path");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const { decode } = require("html-entities");
const { isAfter, startOfDay } = require("date-fns");
const stringify = require("json-stable-stringify");
const diff = require("fast-diff");

const readJSON = async (filePath) => {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
};

// Write via a temporary file and rename into place. Renaming is atomic, so a
// reader never sees a half-written file - which matters because a timed-out
// pipeline step can leave an orphaned process still writing to the same path
// while the next attempt (or an artifact upload) is reading it.
// The temp name is unique per call so concurrent writers can't corrupt each
// other's temp file, and starts with a dot so artifact uploads configured with
// `include-hidden-files: false` skip any temp left behind by a killed process.
const writeJSON = async (filePath, value) => {
  const data = stringify(value, { space: 2 });
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);
  } catch (e) {
    await fs.rm(tempPath, { force: true });
    throw e;
  }
};

const basicNormalize = (value = "") =>
  value.toLowerCase().replaceAll(",", "").replace(/\s+/g, " ").trim();

// Placeholder names that shouldn't be used for matching
const unhelpfulCrewNames = [
  /^various$/i,
  /^various\s+/i, // "Various Directors", "Various Mystery Directors", etc.
  /^tbc$/i,
  /^tba$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^none$/i,
  /^multiple$/i,
  /^multiple\s+/i, // "Multiple Directors", etc.
  /^mixed$/i,
  /^who knows/i, // "Who Knows?", etc.
  /collective$/i, // "Sake Collective", etc.
  /^the metropolitan opera$/i,
];

const isHelpfulCrewName = (name) =>
  !unhelpfulCrewNames.some((pattern) => pattern.test(name.trim()));

// Clean up crew names by removing common prefixes/suffixes
const cleanCrewName = (name) =>
  name
    .trim()
    .replace(/\s+\.$/g, "") // Remove trailing " ."
    .replace(/^award[- ]winning\s+(director|filmmaker)\s+/i, "") // "award-winning director X" -> "X"
    .trim();

const sanitizePathSegment = (value = "") => {
  return value
    .normalize("NFKC")
    .replace(/\0/g, "")
    .replace(/[/\\]+/g, "-") // replace separators
    .replace(/^[.\s]+/, "") // avoid hidden files / traversal
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "") // whitelist chars
    .slice(0, 255);
};

const sortAndFilterMovies = (movies) => {
  const startOfToday = startOfDay(new Date());

  const updatesMovies = movies.reduce((populatedMovies, movie) => {
    const performances = movie.performances
      .filter(({ time }) => isAfter(time, startOfToday))
      .sort((a, b) => a.time - b.time);

    // Remove movies which don't have any performances
    if (performances.length === 0) return populatedMovies;
    return populatedMovies.concat({ ...movie, performances });
  }, []);

  return updatesMovies.sort((a, b) => a.title.localeCompare(b.title));
};

const getMovieTitleAndYearFrom = (title) => {
  const hasYear = title.trim().match(/^(.*?)\s*\((\d{4})\)$/);
  if (hasYear)
    return {
      title: hasYear[1].trim(),
      year: hasYear[2],
    };
  return { title };
};

const convertToList = (value) => {
  if (!value) return [];
  const list = value
    .split(/,|\n|\||\/|&|;|•/g)
    .map((value) => value.replace(/\s+/g, " ").trim());
  return list.filter((item) => item !== "");
};

// Lists have already been split on their separators by the time this runs, so
// an Oxford comma leaves the conjunction stranded at the front of the last
// item: "Mo Chara, DJ Próvaí, and Michael Fassbender" splits to
// [..., "and Michael Fassbender"], which the joiner never matches. Strip a
// leading conjunction as well as splitting on the joined form. Matched with a
// trailing space so names that merely start with the word ("Andrea Arnold")
// are left alone.
const splitConjoinedItemsInList = (list, joiner = " and ") => {
  const conjunction = joiner.trim().toLowerCase();
  const removeLeadingJoiner = (value) => {
    // An item that is nothing but the conjunction is left-over punctuation
    // rather than a value, so drop it.
    if (value.toLowerCase() === conjunction) return "";
    return value.toLowerCase().startsWith(`${conjunction} `)
      ? value.slice(conjunction.length + 1).trim()
      : value;
  };

  return list.reduce(
    (updatedList, item) =>
      updatedList.concat(
        item
          .split(joiner)
          .map((value) => removeLeadingJoiner(value.trim()))
          .filter((value) => value !== ""),
      ),
    [],
  );
};

const classifications = ["U", "PG", "12", "12A", "15", "18"];
const getValidClassification = (value = "") => {
  const sanitizedValue = (value ?? "")
    .toLowerCase()
    .replace("+", "")
    .replace("*", "")
    .replace("(", "")
    .replace(")", "")
    .replace(" certificate", "")
    .replace("advised ", "")
    .replace("r18", "18")
    .trim()
    .toUpperCase();
  return classifications.includes(sanitizedValue) ? sanitizedValue : undefined;
};

// Split a trailing classification off a title, e.g. "Harvest (18)" ->
// { title: "Harvest", classification: "18" }. Only strips the parenthetical
// when it's a valid certificate, so titles ending in other parens (years,
// etc.) are left untouched.
const parseTitleAndClassification = (titleText) => {
  const match = titleText.match(/^(.*?)\s*\(([A-Z0-9]+)\)\s*$/);
  const classification = match && getValidClassification(match[2]);
  return classification
    ? { title: match[1], classification }
    : { title: titleText };
};

const parseMinsToMs = (value) => parseInt(value, 10) * 60 * 1000;

const sanitizeRichText = (value = "") =>
  decode(
    value
      .replaceAll("\\n", "\n")
      .replaceAll("\\", "")
      .replaceAll("<br />", "\n")
      .replaceAll("<br>", "\n")
      .replaceAll("<p>", "\n")
      .replaceAll("</p>", "\n")
      .replaceAll("<strong>", "")
      .replaceAll("</strong>", "")
      .replaceAll("<em>", "")
      .replaceAll("</em>", "")
      .replaceAll("<font>", "")
      .replaceAll("</font>", "")
      .replaceAll("<i>", "")
      .replaceAll("</i>", "")
      .replaceAll("<b>", "")
      .replaceAll("</b>", "")
      .replaceAll("<u>", "")
      .replaceAll("</u>", "")
      .replaceAll("<ul>", "")
      .replaceAll("</ul>", "")
      .replaceAll("<li>", "")
      .replaceAll("</li>", "")
      .replaceAll(/<span[^>]*>/gi, "")
      .replaceAll("</span>", "")
      .trim(),
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (
  fn,
  { retries = 1, delayMs = 30_000, label = "Operation" } = {},
) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Honour a server-provided Retry-After (e.g. on a 429) when present,
        // otherwise fall back to the configured fixed delay.
        const wait = error.retryAfterMs ?? delayMs;
        console.log(
          ` ! - ${label} failed (${error.message}), retrying in ${Math.round(wait / 1000)}s...`,
        );
        await sleep(wait);
      } else {
        console.log(` ! - ${label} failed (${error.message})`);
      }
    }
  }
  throw lastError;
};

// HTTP statuses worth retrying: 429 (rate limited) and transient upstream
// failures. Other non-ok statuses (404, 401, etc.) are not transient and
// should fail immediately rather than burning the retry budget.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// Retry-After is either a number of seconds or an HTTP date. Returns ms, or
// undefined when absent/unparseable so the caller falls back to its own delay.
const parseRetryAfter = (value) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
};

// Build a fetch error that carries the HTTP status, so callers can tell a
// rate-limit/upstream failure (429/503/...) apart from a not-found (404) and
// react accordingly rather than treating every failure the same.
const fetchError = (url, response) => {
  const error = new Error(
    `Failed to fetch ${url} - ${response.status} ${response.statusText}`,
  );
  error.status = response.status;
  return error;
};

const fetchWithRetry = async (
  url,
  options = {},
  { retries = 1, delayMs = 30_000 } = {},
) => {
  return withRetry(
    async () => {
      const response = await fetch(url, options);
      // A 429/503 is a *successful* fetch with a non-ok response, so it never
      // throws on its own — surface it as an error here so withRetry backs off
      // and retries instead of passing the failure straight through.
      if (RETRYABLE_STATUSES.has(response.status)) {
        const error = fetchError(url, response);
        error.retryAfterMs = parseRetryAfter(
          response.headers.get("retry-after"),
        );
        throw error;
      }
      return response;
    },
    { retries, delayMs, label: "Fetch" },
  );
};

const fetchText = async (url, options, retryConfig) => {
  const response = await fetchWithRetry(url, options, retryConfig);
  if (!response.ok) throw fetchError(url, response);
  return response.text();
};

const fetchWin1252Text = async (url) => {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw fetchError(url, response);
  const buffer = Buffer.from(await response.arrayBuffer());
  return iconv.decode(buffer, "win1252");
};

const fetchJson = async (url, options, retryConfig) => {
  const response = await fetchWithRetry(url, options, retryConfig);
  if (!response.ok) throw fetchError(url, response);
  return response.json();
};

const getText = ($el) => $el.text().trim();

const assertSelector = (html, selector, message) => {
  const $ = cheerio.load(html);
  if ($(selector).length === 0) {
    throw new Error(
      message ||
        `Expected "${selector}" not found — the page structure may have changed`,
    );
  }
};

const screenNumberMapping = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const getScreen = (screen) => {
  if (typeof screen !== "string" || !screen) return undefined;

  const screenNumber = screen
    .toLowerCase()
    .replace("screen", "")
    .replace("nft", "")
    .replace("kia", "")
    .replace("(unreserved)", "")
    .replace(/^s(\d+)$/i, "$1")
    .trim();

  const mappedScreenNumber = screenNumberMapping[screenNumber.toLowerCase()];
  if (mappedScreenNumber) return `${mappedScreenNumber}`;

  // If we couldn't condense the screen down to a number, it's probably got a
  // name like "Cinema 1" (Barbicon) or "Reuben Library" (BFI), so just return
  // the original value
  if (`${parseInt(screenNumber, 10)}` !== screenNumber) return screen;

  return screenNumber;
};

// An unparseable date used to become `time: NaN`, which the past-performance
// filter in `sortAndFilterMovies` then discarded exactly like a screening that
// had genuinely already happened — silently dropping the showing before schema
// validation could reject it. Throw here so a broken date parser fails at the
// venue that produced it.
const createPerformance = ({
  date,
  notesList = [],
  url,
  screen,
  status = {},
  accessibility,
  format,
}) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`createPerformance: invalid date (received ${date})`);
  }

  return {
    time: date.getTime(),
    notes: notesList
      .map((value) => value?.trim())
      .filter((value) => !!value)
      .join("\n")
      .trim(),
    bookingUrl: typeof url === "function" ? url() : encodeURI(url),
    screen: getScreen(screen),
    status,
    accessibility,
    format,
  };
};

// Eventbrite serves one event from either of its country domains, so the
// Cinema Museum links "eventbrite.co.uk/e/<id>" for a screening the source
// reaches at "eventbrite.com/checkout-external?eid=<id>". Same organiser, same
// event, so fold the pair to one host rather than reading them as two sellers.
const EVENTBRITE_HOST = /^eventbrite\.(?:com|co\.uk)$/;

// Compared with any leading "www." dropped, so a venue linking to
// "www.japanesefilm.club" and a source linking to "japanesefilm.club" are
// recognised as the same organiser. Returns undefined for anything that isn't
// an absolute URL, which callers must treat as "identifies nothing".
const getBookingHost = (bookingUrl = "") => {
  try {
    const host = new URL(bookingUrl).host.replace(/^www\./, "").toLowerCase();
    return EVENTBRITE_HOST.test(host) ? "eventbrite.com" : host;
  } catch {
    return undefined;
  }
};

// Venues hand booking for some screenings over to the organiser running them —
// the Lexi lists "Japanese Film Club: Kamikaze Girls" but sends bookings to
// japanesefilm.club, and Coldharbour Blue sends its film club nights to
// thecliq.app — and the source covering that organiser finds the same screening.
// That gives us the same screening twice, so drop the sourced copy wherever the
// venue already books through the organiser.
//
// The two sides rarely agree on the link. For one screening of Shall We Dance?
// the Phoenix linked japanesefilm.club's film page while japanesefilm.club
// linked its own per-performance page; for Night Is Short, Walk On Girl the Rio
// linked a japanesefilm.club seat-select URL. Only the Lexi happened to publish
// the identical URL, so matching on the URL alone deduplicated one venue in
// three. Time plus booking host identifies the screening however each side
// spells the link.
//
// Bookings on the venue's own domain are excluded from that: they say nothing
// about who is running the night, and a venue can genuinely have two of them at
// the same time across screens (the Phoenix opens Con Air and As Good as It Gets
// together). Those still have to match exactly to be dropped.
const removeAlreadyListedPerformances = (
  movies,
  listOfSourcedEvents,
  { venueDomain } = {},
) => {
  const venueHost = getBookingHost(venueDomain);
  if (!venueHost) {
    throw new Error(
      `removeAlreadyListedPerformances: venueDomain must be an absolute URL (received ${venueDomain})`,
    );
  }

  const venuePerformances = movies.flatMap(({ performances }) => performances);

  const venueBookingUrls = new Set(
    venuePerformances
      .map(({ bookingUrl }) => basicNormalize(bookingUrl))
      // A performance without a booking URL identifies nothing, so it must not
      // become a key that matches other performances lacking one too.
      .filter((bookingUrl) => bookingUrl !== ""),
  );

  const venueHandedOverSlots = new Set(
    venuePerformances
      .map(({ time, bookingUrl }) => ({
        time,
        host: getBookingHost(bookingUrl),
      }))
      .filter(({ host }) => host && host !== venueHost)
      .map(({ time, host }) => `${time}|${host}`),
  );

  return listOfSourcedEvents.map((event) => ({
    ...event,
    performances: event.performances.filter(({ time, bookingUrl }) => {
      if (venueBookingUrls.has(basicNormalize(bookingUrl))) return false;
      const host = getBookingHost(bookingUrl);
      return !(host && venueHandedOverSlots.has(`${time}|${host}`));
    }),
  }));
};

// Refine a list of performance notes against a venue's curated label lists.
// Each note is either a bare label ("Requires 3D glasses") or a
// "Label: description" pair. The label (text before the first ": ") is matched
// against two sets:
//   - strip: the description is redundant gloss, so keep the label alone
//     (e.g. "Dolby Atmos: Screenings that use Dolby Atmos sound" -> "Dolby Atmos")
//   - drop: both label and description are generic, so remove the note entirely
// Anything not listed is passed through untouched, so info-bearing notes
// (prices, ID/age requirements, safety warnings) are preserved.
const stripNoteLabels = (notesList, { strip = [], drop = [] } = {}) => {
  const stripSet = new Set(strip);
  const dropSet = new Set(drop);
  return notesList.reduce((refined, note) => {
    if (typeof note !== "string") return refined;
    const separatorIndex = note.indexOf(": ");
    const label = (
      separatorIndex === -1 ? note : note.slice(0, separatorIndex)
    ).trim();
    if (dropSet.has(label)) return refined;
    if (stripSet.has(label)) return refined.concat(label);
    return refined.concat(note);
  }, []);
};

// Film clubs and collectives that hire a venue for the night credit themselves
// on a line of their own — "Waltham Forest Cinema Project presents ...", or the
// inverted "Presented by Distorted Frame, a film club which ..." — and nowhere
// else on the page, so without this the attribution is lost. Each phrasing
// bounds the name differently: "presents" closes it, while the inverted form
// runs to the first comma or sentence break, before any gloss on who they are.
// Try the inverted form first, as the more specific of the two.
//
// Both anchor to the start of the text they're given, and callers choose what
// to offer: a credit buried mid-sentence is far likelier to be prose ("The film
// presents a bleak vision ...") than an attribution.
const PRESENTER_PATTERNS = [
  /^presented by\s+([^.,;:!?\n]{3,80})/i,
  /^([^.!?\n]{3,80}?)\s+presents?\s/i,
];

// Only accept a name that reads like an organisation — opening and closing on a
// capitalised word ("Distorted Frame") — so ordinary prose isn't mistaken for a
// credit. Biased towards missing a credit over inventing one.
const looksLikeOrganisation = (name) => {
  const words = name.split(/\s+/);
  return /^[A-Z0-9]/.test(words[0]) && /^[A-Z0-9]/.test(words.at(-1));
};

const getPresenterNote = (text) => {
  for (const pattern of PRESENTER_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const presenter = match[1].trim();
    if (!looksLikeOrganisation(presenter)) continue;

    return `Presented by ${presenter}`;
  }
  return null;
};

const attemptEncodingFix = (value) => {
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
};

const removeNotes = (value) => {
  // Remove role notes, e.g. "Meryl Streep (Narration)" -> "Meryl Streep"
  return value.replace(/\([^)]+\)$/i, "").trim();
};

const convertNamesTextToList = (names) =>
  splitConjoinedItemsInList(convertToList(names))
    .map(attemptEncodingFix)
    .map(removeNotes);

const createOverview = ({
  duration,
  year,
  categories = "",
  directors = "",
  actors = "",
  classification,
  trailer,
}) => {
  const processedDirectors = Array.isArray(directors)
    ? directors
    : convertNamesTextToList(directors);

  const processedActors = Array.isArray(actors)
    ? actors
    : convertNamesTextToList(actors);

  return {
    duration: parseMinsToMs(duration) || undefined,
    year: year ? `${year}` : undefined,
    categories: Array.isArray(categories)
      ? categories
      : splitConjoinedItemsInList(convertToList(categories)),
    directors: processedDirectors.map(cleanCrewName).filter(isHelpfulCrewName),
    actors: processedActors.map(cleanCrewName).filter(isHelpfulCrewName),
    classification: getValidClassification(classification),
    trailer: trailer || undefined,
  };
};

const audioDescriptionMatchers = [
  /\bAD\b/, // "AD: Film Name" or "Film (AD)" — uppercase only to avoid false positives
  /Audio Descri/i, // "Audio Described", "Audio Description"
];

const relaxedMatchers = [
  /Relaxed Screen/i,
  /Relaxed Preview/i,
  /^Relaxed /i,
  /\(Relaxed\)/i,
  /Dementia[-\s]Friendly/i,
  /SEND[-\s]Friendly/i,
];

const babyFriendlyMatchers = [
  /Parents? ([&+]|and) Baby/i,
  /Baby\s*([&+]|and)\s*1/i,
  /Carers? ([&+]|and) Bab(?:y|ies)/i,
  /\bC&B:/i,
  /Kids Club:/i,
  /Babykino:/i,
  /Family Film Club/i,
];

const subtitledMatchers = [
  /Subtitl?e[ds]/i,
  /Subbed/i,
  /\(Sub\)/i,
  /Subs\)/i,
  /with Subtitles/i,
  /\(SS\)/i,
];

const hardOfHearingMatchers = [
  /Caption(?:ed)?/i,
  /\bHOH\b/i,
  /Hard of Hearing/i,
  /\bSDH\b/i,
  /\bBSL\b/i,
  /\bCC\b/,
  /\bOC\b/,
];

const getTitleAccessibility = (title) => {
  const titleAccessibility = {};
  if (audioDescriptionMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.audioDescription = true;
  }
  if (relaxedMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.relaxed = true;
  }
  if (babyFriendlyMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.babyFriendly = true;
  }
  if (subtitledMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.subtitled = true;
  }
  if (hardOfHearingMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.hardOfHearing = true;
  }
  return titleAccessibility;
};

const descriptionAccessibilityMatchers = {
  audioDescription: [
    /(?:is |this |includes? )audio descri/i,
    /audio description (?:is )?available/i,
  ],
  relaxed: [
    /relaxed screening/i,
    /neurodiversity-friendly (?:film )?screening/i,
  ],
  babyFriendly: [/parent and baby/i, /parent & baby/i, /baby friendly/i],
  subtitled: [
    /with (?:english )?(?:and \w+ )?subtitles/i,
    /english subtitles/i,
    /subtitles will be displayed/i,
    /with subtitles from/i,
    /this film is subtitled/i,
  ],
  hardOfHearing: [
    /\bwith captions\b/i,
    /\bcaptioned screening/i,
    /\bsubtitles"? for the he?ard of hearing/i,
    /\bsubtitles"? for those with hearing loss/i,
    /\bdescriptive subtitles/i,
    /BSL interpretation/i,
  ],
};

const descriptionNegationPattern =
  /\b(?:not|no|without|doesn't|does not|don't|do not|isn't|is not|won't|will not|cannot|can't|lack)\b/i;

// Blurbs sometimes signpost OTHER accessible screenings with a cross-link,
// e.g. "Find screenings of The Odyssey with subtitles for the D/deaf and those
// experiencing hearing loss". That describes a different listing, not these
// performances, so strip the whole clause before scanning for features.
const descriptionSignpostPattern = /\bfind (?:more )?screenings? of\b[^.\n]*/gi;

const getDescriptionAccessibility = (description) => {
  if (!description) return {};

  const scannable = description.replace(descriptionSignpostPattern, " ");

  const matchersList = Object.entries(descriptionAccessibilityMatchers);

  const accessibility = {};
  for (const [key, matchers] of matchersList) {
    for (const matcher of matchers) {
      const match = scannable.match(matcher);
      if (!match) continue;
      // Check the 60 characters before the match for negation words
      const matchIndex = match.index;
      const preceding = scannable.slice(
        Math.max(0, matchIndex - 60),
        matchIndex,
      );
      if (descriptionNegationPattern.test(preceding)) continue;
      accessibility[key] = true;
      break;
    }
  }
  return accessibility;
};

const createAccessibility = (title, accessibility, description = "") => {
  const titleAccessibility = getTitleAccessibility(title.trim());
  const descriptionAccessibility = getDescriptionAccessibility(description);

  const listingAccessibility = Object.keys(accessibility).reduce(
    (mapping, key) => {
      if (!accessibility[key]) return mapping;
      return { ...mapping, [key]: true };
    },
    {},
  );

  return {
    ...descriptionAccessibility,
    ...titleAccessibility,
    ...listingAccessibility,
  };
};

// ---------------------------------------------------------------------------
// Format - how a performance is being shown. Two orthogonal axes:
//   source       - the print / picture source (70mm, 35mm, 16mm, vhs, nitrate)
//   presentation - a premium screen system (imax, 4dx, screenx, dolby-cinema)
//
// A standard digital screening has no notable format and resolves to {} - like
// createAccessibility, only notable values are emitted. "Production" formats
// (how a film was *shot*, e.g. "shot on 35mm", "VistaVision cinematography")
// are deliberately NOT treated as a screening format.
//
// "imax-70mm" is a distinct source, not a 70mm + imax combination: it's a 15/70
// (horizontal) IMAX print, a different film geometry from a standard 5/70 70mm
// print - the "imax" names the print format, not the venue, and it is orthogonal
// to the presentation axis (which still records the screen system).
// ---------------------------------------------------------------------------
// Maps a normalised single token (spacing/punctuation stripped) to axis+value.
// This is the source of truth for supported formats; the schema enums for
// performances[].format.{source,presentation,dimension} mirror the values below.
//   source       - the print / picture source (a screening has at most one)
//   presentation - a premium screen system (at most one)
//   dimension    - 2D vs 3D (orthogonal to the above; combines with them)
const formatTokens = {
  "70mm": { source: "70mm" },
  imax70mm: { source: "imax-70mm" },
  "35mm": { source: "35mm" },
  "16mm": { source: "16mm" },
  vhs: { source: "vhs" },
  laserdisc: { source: "laserdisc" },
  nitrate: { source: "nitrate" },
  imax: { presentation: "imax" },
  "4dx": { presentation: "4dx" },
  screenx: { presentation: "screenx" },
  dolbycinema: { presentation: "dolby-cinema" },
  "2d": { dimension: "2d" },
  "3d": { dimension: "3d" },
};

const normalizeFormatToken = (value = "") =>
  basicNormalize(value.replace(/[\s._-]+/g, ""));

// Validate a single raw token (e.g. a listing attribute id like "IMAX", "70mm"
// or "3D") into { source } | { presentation } | { dimension } | {}. Unknown
// tokens (4k, dolby-atmos, ...) are intentionally dropped.
const getValidFormat = (value = "") =>
  formatTokens[normalizeFormatToken(value)] || {};

// Validate an already-split { source, presentation, dimension } object, dropping
// any value that isn't a recognised member of its axis.
const getValidFormatObject = ({ source, presentation, dimension } = {}) => {
  const result = {};
  const validSource = source && getValidFormat(source).source;
  const validPresentation =
    presentation && getValidFormat(presentation).presentation;
  const validDimension = dimension && getValidFormat(dimension).dimension;
  if (validSource) result.source = validSource;
  if (validPresentation) result.presentation = validPresentation;
  if (validDimension) result.dimension = validDimension;
  return result;
};

const titleFormatMatchers = [
  { regex: /\b70\s?mm\b/i, format: { source: "70mm" } },
  // IMAX 70mm (15/70) is a distinct source - listed after bare 70mm so that on
  // an "IMAX 70mm" title this later rule wins the source (matchers spread in
  // order). The imax matcher below still adds presentation:imax for the screen.
  { regex: /\bimax\s*70\s?mm\b/i, format: { source: "imax-70mm" } },
  { regex: /\b35\s?mm\b/i, format: { source: "35mm" } },
  { regex: /\b16\s?mm\b/i, format: { source: "16mm" } },
  { regex: /\bvhs\b/i, format: { source: "vhs" } },
  { regex: /\blaser\s?disc\b/i, format: { source: "laserdisc" } },
  // Negative lookbehind avoids the venue name "BFI IMAX" reading as a format.
  { regex: /(?<!bfi\s)\bimax\b/i, format: { presentation: "imax" } },
  { regex: /\b4dx\b/i, format: { presentation: "4dx" } },
  { regex: /\bscreenx\b/i, format: { presentation: "screenx" } },
  { regex: /\bdolby\s+cinema\b/i, format: { presentation: "dolby-cinema" } },
  // Dimension from a title is only read from a parenthetical "(3D)"/"(2D)"
  // qualifier - a venue-added marker (e.g. BFI IMAX, Omniplex). A *bare* "3D" is
  // deliberately NOT matched: it's usually part of a film's name ("Piranha 3D")
  // or a pun ("Mark Kermode Live in 3D"), and structured listing data covers the
  // multiplexes anyway.
  { regex: /\(\s*3d\s*\)/i, format: { dimension: "3d" } },
  { regex: /\(\s*2d\s*\)/i, format: { dimension: "2d" } },
];

const getTitleFormat = (title) =>
  titleFormatMatchers.reduce(
    (acc, { regex, format }) =>
      regex.test(title) ? { ...acc, ...format } : acc,
    {},
  );

// Description matching is source-only (presentation systems are effectively
// never described in prose).
const descriptionFormatMatchers = [
  { regex: /\b70\s?mm\b/gi, format: { source: "70mm" } },
  // IMAX 70mm (15/70) is a distinct source - listed after bare 70mm so it wins
  // the source when prose says "IMAX 70mm" (e.g. the Science Museum's "IMAX 70mm
  // screenings of ..."). Still gated by the exhibition-cue check below, which
  // keeps the venue-boast "70mm IMAX cinema" (no cue) from matching.
  { regex: /\bimax\s*70\s?mm\b/gi, format: { source: "imax-70mm" } },
  { regex: /\b35\s?mm\b/gi, format: { source: "35mm" } },
  { regex: /\b16\s?mm\b/gi, format: { source: "16mm" } },
  { regex: /\bnitrate\b/gi, format: { source: "nitrate" } },
];

// A description only contributes a source when there's an explicit *exhibition*
// cue right by the gauge ("projected on 16mm", "a new 35mm print", "presented
// on nitrate"). This deliberately ignores the far more common prose about how a
// film was made or its medium - "shot on 16mm", "16mm cinematography", "16mm
// Bolex camera", "immortalized on 8mm and 16mm" - which are not screening
// formats. Preferring these false negatives keeps arty/repertory venues honest.
const exhibitionAfterPattern =
  /^\s*(?:prints?|presentations?|screenings?|projections?)\b/i;
const exhibitionBeforePattern =
  /\b(?:presented|projected|screened|screening|shown|showing|projection)\b[^.]{0,30}$/i;

const getDescriptionFormat = (description) => {
  if (!description) return {};
  const result = {};
  for (const { regex, format } of descriptionFormatMatchers) {
    for (const match of description.matchAll(regex)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = description.slice(Math.max(0, start - 35), start);
      const after = description.slice(end, end + 20);
      const hasExhibitionCue =
        exhibitionAfterPattern.test(after) ||
        exhibitionBeforePattern.test(before);
      if (!hasExhibitionCue) continue;
      Object.assign(result, format);
      break;
    }
  }
  return result;
};

// Structured listing data is most reliable, then the title, then description.
const createFormat = (title = "", format = {}, description = "") => ({
  ...getDescriptionFormat(description),
  ...getTitleFormat(title.trim()),
  ...getValidFormatObject(format),
});

// eslint-disable-next-line no-unused-vars
const removeMatchingHints = ({ matchingHints, ...movie }) => movie;

const addTestCategory = (movie) => ({ ...movie, category: "event" });

const compareAsSimilar = (firstString, secondString) => {
  if (firstString === secondString) return true;

  // Compare strings, calculating a score based on the number of characters that
  // have changed. The following counts the number of characters changed
  // (additions and deletions).
  const lettersChanges = diff(firstString, secondString).reduce(
    (count, [score, letters]) => (score === 0 ? count : count + letters.length),
    0,
  );
  // The threshold of 4 below allows for 2 characters to mismatch (a character
  // deleted and then another added), or a difference of 4 characters in length.
  return lettersChanges <= 4;
};

const getId = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);

/**
 * Normalize an API-sourced id to a string for generateShowingId.
 * Expects only string or number; will convert number to string or return the
 * input otherwise for generateShowingId to deal with.
 * Use when the id comes from an external API that might return either type.
 */
function normalizeIdComponent(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function generateShowingId(attributes, rawEventId) {
  const attributesId = normalizeIdComponent(attributes?.id);
  const eventId = normalizeIdComponent(rawEventId);
  if (typeof attributesId !== "string" || attributesId === "") {
    throw new Error(
      "generateShowingId: attributes.id must be a non-empty string",
    );
  }
  if (typeof eventId !== "string" || eventId === "") {
    throw new Error("generateShowingId: eventId must be a non-empty string");
  }
  return `${attributesId.replace(/-$/, "")}-${eventId}`;
}

const isPrivateHire = (title = "") =>
  basicNormalize(title).includes("private hire") ||
  basicNormalize(title).includes("screen hire") ||
  basicNormalize(title).includes("private event") ||
  // Sometimes private screenings are advertised on an event site, but in which
  // case they'll contain more information (like the movie title)
  basicNormalize(title) === "private screening" ||
  basicNormalize(title) === "cleaning screen placeholder" ||
  basicNormalize(title).includes("events placeholder") ||
  basicNormalize(title).includes("conferencing 6 hour") ||
  basicNormalize(title).includes("do not book");

const isOnline = (title = "") =>
  basicNormalize(title).includes("online workshop");

// Backoff schedule (ms) for an overloaded model (502/503). Observed 503 "high
// demand" failures cluster into bad windows of up to ~12 min rather than being
// independent, so a higher attempt count alone doesn't help — total elapsed
// budget vs window length is what determines survival. We probe often early
// (to clear short dips fast, and to land *between* two nearby dips rather than
// sleep through both) then widen, capped at 2 min, for ~18 min of total budget
// to outlast the long windows with margin. One pause per entry, so the schedule
// length + 1 is the max number of attempts.
const MODEL_OVERLOAD_BACKOFF_MS = [
  20_000, 30_000, 30_000, 45_000, 45_000, 60_000, 75_000, 90_000, 105_000,
  120_000, 120_000, 120_000, 120_000, 120_000,
];

// Apply +/- 20% jitter so the ~10 concurrent venue jobs hitting the same shared
// capacity pool don't retry in lockstep and synchronise their load spikes.
const withJitter = (ms, ratio = 0.2) => {
  const delta = ms * ratio;
  return Math.round(ms - delta + Math.random() * 2 * delta);
};

async function runLlmFunction(llmFunction, options = { run: 0 }) {
  try {
    return await llmFunction();
  } catch (e) {
    const { run } = options;
    const retry = () =>
      runLlmFunction(llmFunction, { ...options, run: run + 1 });

    // Fetch failed for an unknown reason; wait 30 seconds and try again.
    if (basicNormalize(e?.message).includes("fetch failed")) {
      if (run >= 4) {
        console.log(` ! - Error asking LLM; failed after ${run + 1} attempts`);
        throw e;
      }
      console.log(" ! - Error asking LLM; pausing before trying again...");
      await sleep(30_000);
      return await retry();
    }

    // A 429 with an insufficient_quota code is a billing condition, not a
    // transient rate limit — the account has no usable credit, so no amount of
    // waiting fixes it (OpenAI wears the same 429 status for both). Fail loudly
    // and immediately instead of grinding through the retry budget.
    if (
      e.status === 429 &&
      (e.code === "insufficient_quota" || e.type === "insufficient_quota")
    ) {
      console.log(
        " ! - Error asking LLM; provider quota exhausted (no usable credit) — add billing credit and retry",
      );
      throw e;
    }

    // Rate limit was met; it should reset after 1 minute but it's had issues
    // before of not resetting correctly. Wait 90 seconds and try again.
    if (e.status === 429) {
      if (run >= 4) {
        console.log(` ! - Error asking LLM; failed after ${run + 1} attempts`);
        throw e;
      }
      console.log(" ! - Error asking LLM; pausing for quota reset...");
      await sleep(90_000);
      return await retry();
    }

    // Model is overloaded or bad gateway; back off on the schedule above and
    // try again.
    if (e.status === 502 || e.status === 503) {
      if (run >= MODEL_OVERLOAD_BACKOFF_MS.length) {
        console.log(` ! - Error asking LLM; failed after ${run + 1} attempts`);
        throw e;
      }
      const pause = withJitter(MODEL_OVERLOAD_BACKOFF_MS[run]);
      console.log(
        ` ! - Error asking LLM; pausing ${Math.round(pause / 1000)}s for model availability (attempt ${run + 1}/${MODEL_OVERLOAD_BACKOFF_MS.length + 1})...`,
      );
      await sleep(pause);
      return await retry();
    }

    // If we error on recitation, there's not much we can do. We don't want the
    // LLM making up information, and Google is blocking it reciting back some
    // of the training information. As such, just return empty.
    if (e?.response?.candidates?.[0]?.finishReason === "RECITATION") {
      return null;
    }

    // If we error on prohibited content, there's not much we can do. This may
    // be as a result of passing in results from the Movie DB with adult results
    // allowed. As such, just return empty.
    if (e?.response?.promptFeedback?.blockReason === "PROHIBITED_CONTENT") {
      return null;
    }

    // The model degenerated and produced unparseable/truncated JSON (e.g. a
    // field looping a repeated character until it hit the output token limit).
    // Retrying is pointless at temperature 0, and the raw response has already
    // been logged in full by callLlm. Give up on this one entry rather than
    // killing the whole run; callers fall back to a safe default.
    if (e instanceof SyntaxError) {
      return null;
    }

    // If it fails for an unknown reason, we need to throw and stop the script
    console.log("Error asking LLM", e);
    throw new Error("Error asking LLM");
  }
}

module.exports = {
  readJSON,
  writeJSON,
  basicNormalize,
  sanitizePathSegment,
  sortAndFilterMovies,
  getMovieTitleAndYearFrom,
  convertToList,
  splitConjoinedItemsInList,
  parseMinsToMs,
  sanitizeRichText,
  sleep,
  withJitter,
  withRetry,
  fetchWithRetry,
  fetchText,
  fetchWin1252Text,
  fetchJson,
  getText,
  assertSelector,
  createPerformance,
  getBookingHost,
  removeAlreadyListedPerformances,
  stripNoteLabels,
  getPresenterNote,
  createOverview,
  createAccessibility,
  createFormat,
  getValidFormat,
  getTitleFormat,
  removeMatchingHints,
  addTestCategory,
  compareAsSimilar,
  getId,
  generateShowingId,
  isPrivateHire,
  isOnline,
  runLlmFunction,
  getValidClassification,
  parseTitleAndClassification,
  convertNamesTextToList,
  getDescriptionAccessibility,
  getTitleAccessibility,
};

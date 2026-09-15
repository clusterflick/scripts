const path = require("node:path");
const { setupPolly } = require("setup-polly-jest");
const FetchAdapter = require("@pollyjs/adapter-fetch");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("../schema.json");
const ChunkedFsPersister = require("./pollyjs-chunked-fs-persister");

global.navigator.onLine = true;

class FetchAdapterNoWarning extends FetchAdapter {
  constructor(...args) {
    super(...args);
    // Turn off the stupid deprecation message
    const logWarn = this.polly.logger.log.warn;
    this.polly.logger.log.warn = (message, ...rest) => {
      if (message.includes("Node has been deprecated")) return;
      logWarn(message, ...rest);
    };
  }
}

// Headers that should be redacted from HAR recordings
const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
];

// Credentials that arrive in a response body rather than a header. A site
// embedding its own map key in the page it serves is that site's business, but
// a recording republishes the key in this repo - and GitHub's push protection
// blocks the push - so it is scrubbed on the way in. Nothing we parse reads
// these: OutSavvy's coordinates come from the marker image URL, not the token.
const SENSITIVE_BODY_PATTERNS = [
  // Mapbox access tokens, public ("pk.") and secret ("sk.").
  /\b[ps]k\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

// Personal data a platform embeds in an otherwise ordinary listing response.
// Unlike the credentials above, this is other people's data rather than a
// site's own: Clyx returns the guest list inside the event record itself -
// `members` holds attendees' names and avatar URLs - next to the organiser's
// contact address and payment-account id. Nothing the pipeline reads touches
// any of it, and a recording is a file in a public repo, so the fields are
// dropped on the way in.
//
// Keyed by host, because these are ordinary words: a `members` or `email` field
// on some other source may be exactly what that source is read for, and this
// must not quietly delete it.
const SENSITIVE_BODY_FIELDS = {
  "app.clyx.com": ["members", "email", "stripeConnectId"],
};

// Delete the named keys wherever they appear, at any depth - an event record
// nests the company that owns it, so the fields are not all top-level.
function deleteFields(value, fields) {
  if (Array.isArray(value)) {
    for (const entry of value) deleteFields(entry, fields);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const field of fields) delete value[field];
  for (const entry of Object.values(value)) deleteFields(entry, fields);
}

function redactBodyFields(text, url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return text;
  }

  const fields = SENSITIVE_BODY_FIELDS[host];
  if (!fields) return text;

  // Only JSON can be narrowed by field. A body that doesn't parse is left as
  // it is: the host-keyed list says the personal data is in this source's JSON,
  // so a non-JSON body here is a redirect or an error page, not a quiet miss.
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  deleteFields(parsed, fields);
  return JSON.stringify(parsed);
}

function redactBody(text, url) {
  if (typeof text !== "string") return text;
  const withoutFields = redactBodyFields(text, url);
  return SENSITIVE_BODY_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    withoutFields,
  );
}

function redactHeaders(headers) {
  if (!headers) return headers;
  return headers.map((header) => {
    if (SENSITIVE_HEADERS.includes(header.name.toLowerCase())) {
      return { ...header, value: "[REDACTED]" };
    }
    return header;
  });
}

function setupPollyWrapper(isRecording, dirname) {
  if (isRecording && process.env.CI) {
    throw new Error("Polly recording turned on on CI");
  }

  const context = setupPolly({
    adapters: [FetchAdapterNoWarning],
    persister: ChunkedFsPersister,
    recordFailedRequests: true,
    recordIfMissing: false,
    persisterOptions: {
      "chunked-fs": {
        recordingsDir: path.resolve(dirname, "__recordings__"),
        maxEntries: 250,
      },
    },
    matchRequestsBy: {
      headers: {
        exclude: SENSITIVE_HEADERS,
      },
    },
    // "replay", "record", or "passthrough"
    mode: isRecording ? "record" : "replay",
  });

  // Add hook to redact sensitive headers before persisting
  beforeEach(() => {
    const { server } = context.polly;
    server.any().on("beforePersist", (req, recording) => {
      recording.request.headers = redactHeaders(recording.request.headers);
      recording.response.headers = redactHeaders(recording.response.headers);
      if (recording.response.content) {
        recording.response.content.text = redactBody(
          recording.response.content.text,
          recording.request.url,
        );
      }
    });
  });

  return context;
}

function schemaValidate(data) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const isValid = validate(data);
  if (!isValid) console.error(validate.errors);

  const addIdToSet = (set, { showingId }) => set.add(showingId);
  const ids = data.reduce(addIdToSet, new Set());
  const hasAllUniqueIds = ids.size === data.length;
  if (!hasAllUniqueIds) console.error("Duplicate IDs detected");

  return isValid && hasAllUniqueIds;
}

const disableCache = () => {
  const { dailyCache } = require("./cache");
  dailyCache.mockImplementation((key, callback) => callback());
};

const setupCacheMock = (dirname, suffix) => {
  const { dailyCache, readDailyCache } = require("./cache");
  const { readCache } = jest.requireActual("./cache");

  dailyCache.mockImplementation((key) =>
    readCache(key, (filename) => {
      if (!filename) return path.join(dirname, "__manual-recordings__");
      const cacheFile = `${filename}-${suffix}`;
      return path.join(dirname, "__manual-recordings__", cacheFile);
    }),
  );

  readDailyCache.mockImplementation((key) =>
    readCache(key, (filename) =>
      path.join(dirname, "__manual-recordings__", `${filename}-${suffix}`),
    ),
  );
};

module.exports = {
  redactBody,
  setupPolly: setupPollyWrapper,
  schemaValidate,
  setupCacheMock,
  disableCache,
};

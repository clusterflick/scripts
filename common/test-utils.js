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

function redactBody(text) {
  if (typeof text !== "string") return text;
  return SENSITIVE_BODY_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    text,
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

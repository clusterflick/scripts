const path = require("node:path");
const { setupPolly } = require("setup-polly-jest");
const FetchAdapter = require("@pollyjs/adapter-fetch");
const PersisterFs = require("@pollyjs/persister-fs");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("../schema.json");

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

function setupPollyWrapper(isRecording, dirname) {
  if (isRecording && process.env.CI) {
    throw new Error("Polly recording turned on on CI");
  }

  return setupPolly({
    adapters: [FetchAdapterNoWarning],
    persister: PersisterFs,
    persisterOptions: {
      fs: {
        recordingsDir: path.resolve(dirname, "__recordings__"),
      },
    },
    // "replay", "record", or "passthrough"
    mode: isRecording ? "record" : "replay",
  });
}

function schemaValidate(data) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const isValid = validate(data);
  if (!isValid) console.error(validate.errors);
  return isValid;
}

const setupCacheMock = (dirname, suffix) => {
  const { dailyCache, readDailyCache } = require("./cache");
  const { readCache } = jest.requireActual("./cache");

  dailyCache.mockImplementation((key) =>
    readCache(key, (filename) =>
      path.join(dirname, "__manual-recordings__", `${filename}-${suffix}`),
    ),
  );

  readDailyCache.mockImplementation((key) =>
    readCache(key, (filename) =>
      path.join(dirname, "__manual-recordings__", `${filename}-${suffix}`),
    ),
  );
};

module.exports = {
  setupPolly: setupPollyWrapper,
  schemaValidate,
  setupCacheMock,
};

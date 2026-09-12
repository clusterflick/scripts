/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  setupCacheMock,
  schemaValidate,
} = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// The date the cache files in __manual-recordings__ were written, which is the
// suffix every one of their filenames carries. Change it when the fixtures are
// replaced, and pin the clock to the same day so the run reads as it did then.
const CACHE_DATE = "2026-09-12";

// A whole retrieve is the two search sweeps, a calendar for every organiser at
// a venue we hold, and an event page each - the better part of a thousand
// requests. They replay from the cache files a real run wrote rather than from
// HTTP recordings of every one of them, which is also what keeps retrieve's
// pacing out of the test: sleep() sits inside the dailyCache callback, and a
// cache hit never calls it. Polly stays for the request that escapes anyway -
// a missing fixture should fail here, not quietly reach Eventbrite.
jest.mock("../../../common/cache");
setupCacheMock(__dirname, CACHE_DATE);

// Hide script output
console.log = () => {};

const cinema = {
  name: "Genesis Cinema",
  geo: { lat: 51.52128726645794, lon: -0.051143457671891594 },
};

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date(CACHE_DATE));

  it("retrieve and find events", async () => {
    const { movieListPages, moviePages, organizerEvents } = await retrieve();

    // Make sure the input looks roughly correct
    expect(movieListPages).toBeTruthy();
    expect(movieListPages).toHaveLength(86);
    expect(moviePages).toBeTruthy();
    expect(Object.keys(moviePages)).toHaveLength(398);
    // The events the capped search never reached, recovered from the
    // organisers it did surface at venues we hold.
    expect(organizerEvents).toHaveLength(81);

    readJSON.mockImplementation(() => ({
      movieListPages,
      moviePages,
      organizerEvents,
    }));

    const output = await findEvents(cinema);
    expect(
      output.every((movie) =>
        Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
      ),
    ).toBe(true);

    const data = JSON.parse(JSON.stringify(output))
      .map(removeMatchingHints)
      .map(addTestCategory);

    // Make sure the data looks roughly correct
    expect(schemaValidate(data)).toBe(true);
    expect(data).toHaveLength(4);
    expect(data).toMatchSnapshot();
  }, 30_000); // over HTTP needed. // under full-suite parallelism, though far short of what replaying them // Reading ~900 cache files back is still more than the default 5s allows
});

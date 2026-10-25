/** @jest-environment setup-polly-jest/jest-environment-node */
const {
  setupPolly,
  schemaValidate,
  silenceConsoleLog,
} = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const auth = require("../auth");
const { attributes, retrieve, findEvents } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

silenceConsoleLog();

describe(attributes.name, () => {
  const context = setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-25"));

  // Signing in sends the account's password and gets a token back, and a
  // recording is a public file - so the sign-in is never recorded. It goes
  // straight through while recording, and is stood in for on replay, where
  // the Authorization header it fed is redacted and not matched on anyway.
  beforeEach(() => {
    if (isRecording) {
      context.polly.server
        .post("https://identitytoolkit.googleapis.com/*")
        .passthrough();
    } else {
      jest.spyOn(auth, "signIn").mockResolvedValue("replayed-id-token");
    }
  });

  describe.each([
    {
      name: "Sevente",
      alternativeNames: ["Sevente's Lounge", "Sevente London"],
      address: "283 Hackney Road, London, E2 8NA, UK",
      geo: { lat: 51.5311805, lon: -0.0677719 },
      expectedMatches: 1,
    },
    {
      name: "The Bath House",
      alternativeNames: ["The Baths", "Hackney Bath House", "Eastway Baths"],
      address: "80 Eastway, London, E9 5JH, UK",
      geo: { lat: 51.547153450863796, lon: -0.02931468783518382 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct - every upcoming event
        // Cinebur holds, worldwide
        expect(events).toHaveLength(3);

        readJSON.mockImplementation(() => ({ events }));

        const cinema = { name, alternativeNames, address, geo };
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
        expect(data).toHaveLength(expectedMatches);
        expect(data).toMatchSnapshot();
      },
      isRecording ? 600_000 : undefined,
    );
  });
});

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
const { attributes, retrieve, findEvents } = require("..");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const isRecording = false;

silenceConsoleLog();

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-14"));

  describe.each([
    {
      id: "lfs.org.uk",
      name: "London Film School",
      expectedMatches: 2,
    },
  ])("$name", ({ id, name, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { festivals } = await retrieve();

        // Make sure the input looks roughly correct
        expect(festivals).toHaveLength(1);
        expect(festivals.flatMap(({ events }) => events)).toHaveLength(2);

        readJSON.mockImplementation(() => ({ festivals }));

        const cinema = { id, name };
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
      isRecording ? 60_000 : undefined,
    );
  });

  it("returns no events for unrelated cinema", async () => {
    const { festivals } = await retrieve();

    readJSON.mockImplementation(() => ({ festivals }));

    // Events are placed by venue id alone, so a venue that shares the name or
    // the street of one in the file is not enough.
    const unrelatedCinema = {
      id: "some-other-cinema",
      name: "London Film School",
    };
    expect(await findEvents(unrelatedCinema)).toHaveLength(0);
  });

  describe("fails loudly when the hosted file is wrong", () => {
    const cinema = { id: "lfs.org.uk", name: "London Film School" };

    async function findEventsWith(change) {
      const { festivals } = await retrieve();
      const changed = JSON.parse(JSON.stringify(festivals));
      change(changed[0].events[0], changed);
      readJSON.mockImplementation(() => ({ festivals: changed }));
      return findEvents(cinema);
    }

    it("throws when a field is misspelt", async () => {
      await expect(
        findEventsWith((event) => {
          event.venu = event.venue;
          delete event.venue;
        }),
      ).rejects.toThrow(/does not match its schema/);
    });

    it("throws when a start time carries an offset", async () => {
      await expect(
        findEventsWith((event) => {
          event.start = `${event.start}+01:00`;
        }),
      ).rejects.toThrow(/does not match its schema/);
    });

    it("throws when an event id is repeated", async () => {
      await expect(
        findEventsWith((event, festivals) => {
          festivals[0].events.push({ ...event });
        }),
      ).rejects.toThrow(/repeats the event id/);
    });

    it("throws when a venue id is unknown", async () => {
      await expect(
        findEventsWith((event) => {
          event.venue = "lfs.org";
        }),
      ).rejects.toThrow(/unknown venue/);
    });
  });
});

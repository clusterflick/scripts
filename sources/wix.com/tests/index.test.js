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

const bfiStephenStreet = {
  name: "BFI Stephen Street",
  alternativeNames: [
    "BFI Screening Room",
    "British Film Institute (BFI), Screening Room 2",
  ],
  address: "21 Stephen Street, London, W1T 1LN, UK",
  geo: { lat: 51.51812195338297, lon: -0.13279528832113588 },
};

// Replace one retrieved event's details, leaving the shared data untouched
const withEvent = (events, changes) => {
  const [id, entry] = Object.entries(events)[0];
  return {
    ...events,
    [id]: { ...entry, event: changes(structuredClone(entry.event)) },
  };
};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-11-27"));

  describe.each([
    { ...bfiStephenStreet, expectedMatches: 3 },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio", "Rio Cinema Dalston"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 0,
    },
  ])("$name", ({ name, alternativeNames, address, geo, expectedMatches }) => {
    it(
      "retrieve and find events",
      async () => {
        const { events } = await retrieve();

        // Make sure the input looks roughly correct
        expect(events).toBeTruthy();
        expect(Object.keys(events)).toHaveLength(3);

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

  it(
    "reads the film list from the event page's description",
    async () => {
      const { events } = await retrieve();
      readJSON.mockImplementation(() => ({ events }));

      const [first] = await findEvents(bfiStephenStreet);
      expect(first.matchingHints.overview).toContain(
        "This screening session features 9 films.",
      );
      expect(first.matchingHints.overview).toContain(
        "Franck (France) by Fabio Caldironi",
      );
      expect(first.matchingHints.filmOrganiser).toBe(true);
    },
    isRecording ? 600_000 : undefined,
  );

  it(
    "drops cancelled and online events",
    async () => {
      const { events } = await retrieve();

      readJSON.mockImplementation(() => ({
        events: withEvent(events, (event) => ({ ...event, status: 3 })),
      }));
      expect(await findEvents(bfiStephenStreet)).toHaveLength(2);

      readJSON.mockImplementation(() => ({
        events: withEvent(events, (event) => {
          event.location.type = 1;
          return event;
        }),
      }));
      expect(await findEvents(bfiStephenStreet)).toHaveLength(2);
    },
    isRecording ? 600_000 : undefined,
  );

  describe("fails loudly when the data changes", () => {
    it(
      "throws on an event status it doesn't know",
      async () => {
        const { events } = await retrieve();
        readJSON.mockImplementation(() => ({
          events: withEvent(events, (event) => ({ ...event, status: 9 })),
        }));

        await expect(findEvents(bfiStephenStreet)).rejects.toThrow(
          /Unknown Wix event status 9/,
        );
      },
      isRecording ? 600_000 : undefined,
    );

    it(
      "throws on a recurring event",
      async () => {
        const { events } = await retrieve();
        readJSON.mockImplementation(() => ({
          events: withEvent(events, (event) => {
            event.scheduling.config.recurrences.occurrences = [{}];
            return event;
          }),
        }));

        await expect(findEvents(bfiStephenStreet)).rejects.toThrow(
          /Recurring Wix events/,
        );
      },
      isRecording ? 600_000 : undefined,
    );
  });
});

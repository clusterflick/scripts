/** @jest-environment setup-polly-jest/jest-environment-node */
const crypto = require("node:crypto");
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

describe(attributes.name, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-10-03"));

  describe.each([
    {
      name: "Finch Community Cinema",
      alternativeNames: ["Finch Cafe/Restaurant"],
      address: "12 Sidworth Street, London, E8 3SD, UK",
      geo: { lat: 51.53977173949334, lon: -0.05752235164484993 },
      expectedMatches: 1,
      stateKey: "00000000-0000-4000-8000-000000000001",
    },
    {
      name: "Rio Cinema",
      alternativeNames: ["The Rio"],
      address: "107 Kingsland High Street, London, E8 2PB, UK",
      geo: { lat: 51.54970097438604, lon: -0.07550473771574956 },
      expectedMatches: 0,
      stateKey: "00000000-0000-4000-8000-000000000002",
    },
  ])(
    "$name",
    ({ name, alternativeNames, address, geo, expectedMatches, stateKey }) => {
      it(
        "retrieve and find events",
        async () => {
          // Polly matches on the request body, so the stateKey must be the
          // recorded one. Each case needs its own: the server leaves out what it
          // has already served under a key, so a reused one returns nothing.
          jest.spyOn(crypto, "randomUUID").mockReturnValue(stateKey);
          const { events, eventPages } = await retrieve();

          // Make sure the input looks roughly correct
          expect(events).toBeTruthy();
          expect(events).toHaveLength(28);
          expect(Object.keys(eventPages)).toHaveLength(28);

          readJSON.mockImplementation(() => ({ events, eventPages }));

          const cinema = { name, alternativeNames, address, geo };
          const output = await findEvents(cinema);
          expect(
            output.every((movie) =>
              Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
            ),
          ).toBe(true);
          // Every event's description comes off its own page
          expect(output.every((movie) => movie.matchingHints.overview)).toBe(
            true,
          );

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
    },
  );
});

describe(`${attributes.name} descriptions`, () => {
  const cinema = {
    name: "Kensington Central Library",
    address: "12 Phillimore Walk, London W8 7RX, UK",
    geo: { lat: 51.5013, lon: -0.1937 },
  };
  const event = {
    _id: "6abf6a11a9ff66983c2964c3",
    name: "60 Years of Carnival",
    hostname: "https://events.humanitix.com/",
    slug: "60-years-of-carnival",
    dates: [{ startDate: "2026-10-10T13:00:00.000Z" }],
    eventLocation: {
      venueName: "Kensington Central Library",
      address: "12 Phillimore Walk, London W8 7RX, UK",
    },
  };
  const url = "https://events.humanitix.com/60-years-of-carnival";
  const module = (heading, content) =>
    `<div class="EventModuleRichText"><h2>${heading}</h2><div class="RichContent">${content}</div></div>`;
  const video =
    '<figure><iframe src="https://www.youtube.com/embed/abc"></iframe></figure>';

  it("skips a Description module holding only a video", async () => {
    readJSON.mockImplementation(() => ({
      events: [event],
      eventPages: {
        [url]:
          module("Description", video) +
          module("Description", "<p>Steel pan</p><p>Plus Q&amp;A</p>"),
      },
    }));

    const output = await findEvents(cinema);
    expect(output).toHaveLength(1);
    expect(output[0].matchingHints.overview).toBe("Steel pan\nPlus Q&A");
  });

  it("throws when two Description modules carry text", async () => {
    readJSON.mockImplementation(() => ({
      events: [event],
      eventPages: {
        [url]:
          module("Description", "<p>One</p>") +
          module("Description", "<p>Two</p>"),
      },
    }));

    await expect(findEvents(cinema)).rejects.toThrow(
      '2 "Description" modules with text',
    );
  });
});

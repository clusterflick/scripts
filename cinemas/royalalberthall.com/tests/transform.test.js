const transform = require("../transform");
const attributes = require("../attributes");
const { expectedClosures } = require("../../../common/expected-closures");
const { silenceConsoleLog } = require("../../../common/test-utils");

// The declared closure this venue's carve-out rides on. Read rather than
// hardcoded, so the test follows the entry when its dates move and disappears
// with it when it lapses.
const closure = expectedClosures.find(({ venue }) => venue === attributes.id);

const filmEvent = (id, title, performances) => ({
  ID: id,
  Title: title,
  Categories: ["Film"],
  EventURL: `/tickets/events/2026/${id}`,
  Summary: `${title} at the Royal Albert Hall`,
  Venue: "Main Auditorium",
  Suffix: null,
  BookingURL: null,
  Image: { caption: null },
  Performances: performances.map((date) => ({ Date: date })),
});

// A box office mid-upgrade and a changed feed look identical from here: every
// event comes back listed, and every one of them comes back with no dates.
const noDates = [
  filmEvent(1837, "Black Panther in Concert (12A)", []),
  filmEvent(1835, "Brassed Off Live (15)", []),
];

describe("royal albert hall transform", () => {
  const consoleLog = silenceConsoleLog();

  afterEach(() => {
    jest.useRealTimers();
  });

  const setToday = (date) => jest.useFakeTimers().setSystemTime(new Date(date));

  it("skips an event with no dates but keeps the ones that have them", async () => {
    setToday("2026-07-11");
    const output = await transform(
      [
        filmEvent(1837, "Black Panther in Concert (12A)", []),
        filmEvent(1835, "Brassed Off Live (15)", ["2026-08-01T19:30:00+01:00"]),
      ],
      {},
    );

    expect(output).toHaveLength(1);
    expect(output[0].title).toBe("Brassed Off Live (15)");
  });

  it("fails when no event has a date and no closure is declared", async () => {
    setToday("2026-07-11");
    await expect(transform(noDates, {})).rejects.toThrow(
      "No movies found - the page structure may have changed",
    );
  });

  (closure ? it : it.skip)(
    "returns nothing while the venue is expected to be unable to list",
    async () => {
      setToday(`${closure.from}T12:00:00`);
      await expect(transform(noDates, {})).resolves.toEqual([]);
      // The log is the whole point of the carve-out - an empty release that
      // explains itself - so check it was said rather than only silenced.
      expect(consoleLog()).toHaveBeenCalledWith(
        expect.stringContaining(closure.reason),
      );
    },
  );

  (closure ? it : it.skip)(
    "fails again the day after the window closes",
    async () => {
      setToday(`${closure.until}T12:00:00`);
      await expect(transform(noDates, {})).resolves.toEqual([]);

      jest.useRealTimers();
      const dayAfter = new Date(`${closure.until}T12:00:00`);
      dayAfter.setDate(dayAfter.getDate() + 1);
      jest.useFakeTimers().setSystemTime(dayAfter);
      await expect(transform(noDates, {})).rejects.toThrow(
        "No movies found - the page structure may have changed",
      );
    },
  );
});

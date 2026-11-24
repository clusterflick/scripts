const { getPassedScreeningEventSlug } = require("../utils");

const origins = [
  "https://www.cinematik.app",
  "https://elevenfiftyfive.cinematik.app",
  "https://escapes.cinematik.app",
  "https://massive.cinematik.app",
];

const EVENT_URL =
  "https://www.cinematik.app/events/i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24";

// Trimmed from the event page that
// https://escapes.cinematik.app/book/i-see-buildings-fall-like-lightning-the-ystradgynlais-miners-welfare-and-community-hall-trust-limited-the-welfare-ystradgynlais-2026-11-23
// redirected to on 23 November 2026, after that screening: The Welfare no
// longer among its screenings, the evening's Curzon Oxford one still there.
// Each screening is a path, or [path, startDate] where the start matters.
const series = (subEvents) => [
  [
    {
      "@context": "https://schema.org",
      "@type": "EventSeries",
      name: "I See Buildings Fall Like Lightning - 23–24 Nov 2026",
      url: EVENT_URL,
      subEvent: subEvents.map((subEvent) => {
        const [path, startDate = "2026-11-23T19:30:00+00:00"] = [
          subEvent,
        ].flat();
        return {
          "@type": "Event",
          url: `https://www.cinematik.app/book/i-see-buildings-fall-like-lightning-${path}`,
          startDate,
        };
      }),
    },
  ],
];

const WELFARE =
  "https://escapes.cinematik.app/book/i-see-buildings-fall-like-lightning-the-ystradgynlais-miners-welfare-and-community-hall-trust-limited-the-welfare-ystradgynlais-2026-11-23";
const OXFORD =
  "https://escapes.cinematik.app/book/i-see-buildings-fall-like-lightning-curzon-cinemas-limited-curzon-oxford-2026-11-23";

const onTheDay = new Date("2026-11-23T17:05:00Z");

describe("getPassedScreeningEventSlug", () => {
  it("reads the event when the series no longer lists the screening", () => {
    const jsonLd = series(["curzon-cinemas-limited-curzon-oxford-2026-11-23"]);
    expect(
      getPassedScreeningEventSlug(WELFARE, jsonLd, origins, onTheDay),
    ).toBe("i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24");
  });

  it("recognises nothing while the series still lists the screening", () => {
    const jsonLd = series(["curzon-cinemas-limited-curzon-oxford-2026-11-23"]);
    expect(
      getPassedScreeningEventSlug(OXFORD, jsonLd, origins, onTheDay),
    ).toBeUndefined();
  });

  // At 18:04 on 24 November 2026 the series still listed its 18:00
  // screenings, whose booking pages already redirected to it.
  it("reads the event when the series still lists a screening that has started", () => {
    const jsonLd = series([
      [
        "curzon-cinemas-limited-curzon-oxford-2026-11-23",
        "2026-11-23T17:00:00+00:00",
      ],
    ]);
    expect(getPassedScreeningEventSlug(OXFORD, jsonLd, origins, onTheDay)).toBe(
      "i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24",
    );
  });

  it("recognises nothing for a listed screening with no readable start", () => {
    const jsonLd = series([
      ["curzon-cinemas-limited-curzon-oxford-2026-11-23", "TBC"],
    ]);
    expect(
      getPassedScreeningEventSlug(OXFORD, jsonLd, origins, onTheDay),
    ).toBeUndefined();
  });

  it("recognises nothing for a screening on a later date", () => {
    const dayBefore = new Date("2026-11-22T12:00:00Z");
    expect(
      getPassedScreeningEventSlug(WELFARE, series([]), origins, dayBefore),
    ).toBeUndefined();
  });

  it("recognises nothing without the series", () => {
    expect(
      getPassedScreeningEventSlug(WELFARE, [], origins, onTheDay),
    ).toBeUndefined();
  });

  it("throws when the series names no event", () => {
    const jsonLd = [{ "@type": "EventSeries", url: "https://example.com/x" }];
    expect(() =>
      getPassedScreeningEventSlug(WELFARE, jsonLd, origins, onTheDay),
    ).toThrow(/names no event/);
  });
});

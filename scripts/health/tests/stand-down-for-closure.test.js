// The declared closures are stubbed rather than read: this file is about what a
// closure does to a row, and the real list is meant to spend most of its life
// empty. Prefixed `mock` so jest's hoisting lets the factory below close over it.
const mockClosure = {
  venue: "myvue.com-finchley-road",
  from: "2026-08-28",
  until: "2026-09-04",
  reason: "refurbishment works",
};

jest.mock("../../../common/expected-closures", () => ({
  getExpectedClosure: (venueId, now) =>
    venueId === mockClosure.venue &&
    mockClosure.from <= now.toISOString().slice(0, 10) &&
    now.toISOString().slice(0, 10) <= mockClosure.until
      ? mockClosure
      : undefined,
}));

const standDownForClosure = require("../stand-down-for-closure");

describe("standDownForClosure", () => {
  // The shape `finalise` produces, trimmed to what this cares about.
  const row = (venue, reason, at = "2026-08-28T12:00:00.000Z") => ({
    at,
    venue,
    granularity: "performance",
    counts: null,
    byDate: null,
    reason,
  });

  const closed = "myvue.com-finchley-road";
  const open = "myvue.com-islington";

  describe("during a declared closure", () => {
    it.each(["unknown-venue-id", "no-listings-found"])(
      "stands down for %s",
      (kind) => {
        expect(standDownForClosure(row(closed, { kind })).reason).toEqual({
          kind: "expected-closure",
          observed: kind,
          until: "2026-09-04",
          closedFor: "refurbishment works",
        });
      },
    );

    it("keeps everything else the row was carrying", () => {
      const original = row(closed, { kind: "no-listings-found" });
      expect(standDownForClosure(original)).toEqual({
        ...original,
        reason: expect.objectContaining({ kind: "expected-closure" }),
      });
    });

    // A closed venue can still be behind a challenge, or break the probe. The
    // closure explains an absence, not a failure to look.
    it.each(["bot-challenge", "source-maintenance", "probe-error"])(
      "leaves %s alone",
      (kind) => {
        const original = row(closed, { kind });
        expect(standDownForClosure(original)).toBe(original);
      },
    );

    it("leaves a healthy row alone", () => {
      const original = { ...row(closed, null), counts: { performances: 1 } };
      expect(standDownForClosure(original)).toBe(original);
    });
  });

  describe("outside a declared closure", () => {
    it("leaves a venue with no closure declared failing", () => {
      const original = row(open, { kind: "unknown-venue-id" });
      expect(standDownForClosure(original)).toBe(original);
    });

    // Judged against the row's own timestamp, so a row read back later means
    // what it meant when it was written - and so the day after the window
    // closes goes red again rather than inheriting the stand-down.
    it.each([
      ["the day before the window opens", "2026-08-27T12:00:00.000Z"],
      ["the day after the window shuts", "2026-09-05T12:00:00.000Z"],
    ])("leaves a row from %s failing", (_, at) => {
      const original = row(closed, { kind: "unknown-venue-id" }, at);
      expect(standDownForClosure(original)).toBe(original);
    });
  });
});

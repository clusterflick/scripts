const { parseISO, addDays, subDays, format } = require("date-fns");
const {
  expectedClosures,
  getExpectedClosure,
} = require("../expected-closures");
const { getAllCinemaNames } = require("../../cinemas");

// Written as filters over the declared closures rather than as cases per
// closure, so the file still runs once every entry has lapsed and been deleted
// - which is the state this list should spend most of its life in.
describe("expected closures", () => {
  describe("the declared closures", () => {
    it("only name venues we track", () => {
      const names = getAllCinemaNames();
      expect(
        expectedClosures.filter(({ venue }) => !names.includes(venue)),
      ).toEqual([]);
    });

    it("have a window that opens before it shuts", () => {
      const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
      expect(
        expectedClosures.filter(
          ({ from, until }) =>
            !isDate(from) || !isDate(until) || !(from <= until),
        ),
      ).toEqual([]);
    });

    it("say why the venue is shut", () => {
      expect(expectedClosures.filter(({ reason }) => !reason)).toEqual([]);
    });
  });

  describe("getExpectedClosure", () => {
    const on = (dateString) => parseISO(`${dateString}T12:00:00`);

    it("covers the first and last day of each window", () => {
      expect(
        expectedClosures.filter(
          ({ venue, from, until }) =>
            !getExpectedClosure(venue, on(from)) ||
            !getExpectedClosure(venue, on(until)),
        ),
      ).toEqual([]);
    });

    it("covers neither the day before nor the day after", () => {
      const dayBefore = (d) => format(subDays(parseISO(d), 1), "yyyy-MM-dd");
      const dayAfter = (d) => format(addDays(parseISO(d), 1), "yyyy-MM-dd");
      expect(
        expectedClosures.filter(
          ({ venue, from, until }) =>
            getExpectedClosure(venue, on(dayBefore(from))) ||
            getExpectedClosure(venue, on(dayAfter(until))),
        ),
      ).toEqual([]);
    });

    it("does not cover a venue that has no closure declared", () => {
      const open = getAllCinemaNames().find(
        (name) => !expectedClosures.some(({ venue }) => venue === name),
      );
      expect(getExpectedClosure(open)).toBeUndefined();
    });
  });
});

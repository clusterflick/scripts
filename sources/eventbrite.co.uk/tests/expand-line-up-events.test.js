const { schemaValidate } = require("../../../common/test-utils");
const {
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const {
  isLineUpEvent,
  expandLineUpEvent,
} = require("../expand-line-up-events");
const rebelParty = require("./fixtures/rebel-party.json");

// The line-up parser reads the schedule out of the event's description text, so
// it can be exercised directly against a captured description rather than
// through retrieve(). Re-recording the source's HAR files means ~1000 live page
// fetches against a rate-limited API, which is far too expensive to pay for a
// parser test.

// Build an event whose description is the given plain text, for the cases that
// are easier to state as text than to carve out of the real fixture.
const buildEvent = (text, overrides = {}) => ({
  event: {
    id: "1234567890",
    url: "https://www.eventbrite.co.uk/e/a-season-tickets-1234567890",
    tickets_url: "https://www.eventbrite.com/checkout-external?eid=1234567890",
    start_date: "2026-08-30",
    start_time: "18:30",
    end_date: "2026-10-25",
    end_time: "23:30",
    ...overrides,
  },
  details: {
    props: {
      pageProps: {
        context: { structuredContent: { modules: [{ type: "text", text }] } },
      },
    },
  },
});

const oneFilmSynopsis = [
  "Quadrophenia (1979)",
  "Director: Franc Roddam",
  "Cast: Phil Daniels, Ray Winstone",
  "Running Time: 120 mins",
  "Jimmy is a young Mod looking for pills, thrills and a sense of identity.",
  "Distributor: Universal Pictures",
  "Rating: 15",
].join("\n");

describe("expand-line-up-events", () => {
  describe("isLineUpEvent", () => {
    it("recognises an allow-listed event", () => {
      expect(isLineUpEvent({ id: "1996329278612" })).toBe(true);
    });

    it("recognises an allow-listed event given a numeric id", () => {
      expect(isLineUpEvent({ id: 1996329278612 })).toBe(true);
    });

    it("leaves every other event alone", () => {
      expect(isLineUpEvent({ id: "1993934010300" })).toBe(false);
    });
  });

  describe("expandLineUpEvent", () => {
    it("expands Film Tottenham's season into one showing per film", () => {
      const output = expandLineUpEvent(rebelParty.event, rebelParty.details);

      expect(output).toHaveLength(8);
      expect(output.map(({ title }) => title)).toEqual([
        "Quadrophenia",
        "Human Traffic",
        "This Is England",
        "Kneecap",
        "It's All Gone Pete Tong",
        "Trainspotting",
        "Twin Town",
        "Young Soul Rebels",
      ]);

      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);
      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    });

    it("reads each screening's own date and time", () => {
      const output = expandLineUpEvent(rebelParty.event, rebelParty.details);

      expect(
        output.map(({ performances }) =>
          new Date(performances[0].time).toISOString(),
        ),
      ).toEqual([
        "2026-08-30T17:30:00.000Z",
        "2026-09-06T17:30:00.000Z",
        "2026-09-13T17:30:00.000Z",
        "2026-09-20T17:30:00.000Z",
        "2026-09-27T17:30:00.000Z",
        "2026-10-03T17:30:00.000Z",
        "2026-10-09T17:30:00.000Z",
        // Clocks go back on the 25th, so this one is 18:30 GMT not BST
        "2026-10-25T18:30:00.000Z",
      ]);
    });

    it("carries each film's own details rather than the season's", () => {
      const [quadrophenia] = expandLineUpEvent(
        rebelParty.event,
        rebelParty.details,
      );

      expect(quadrophenia.overview).toEqual(
        expect.objectContaining({
          duration: 120 * 60 * 1000,
          year: "1979",
          directors: ["Franc Roddam"],
          classification: "15",
        }),
      );
      expect(quadrophenia.performances[0].notes).toBe(
        "with post film discussion",
      );
      // The shared preamble says they "aim to show each film with subtitles",
      // which must not leak into a per-film overview and tag every screening.
      expect(quadrophenia.matchingHints.overview).not.toMatch(/subtitles/i);
    });

    it("gives each screening a stable id derived from its date", () => {
      const output = expandLineUpEvent(rebelParty.event, rebelParty.details);

      expect(output.map(({ showingId }) => showingId)).toEqual([
        "eventbrite.co.uk-1996329278612-2026-08-30",
        "eventbrite.co.uk-1996329278612-2026-09-06",
        "eventbrite.co.uk-1996329278612-2026-09-13",
        "eventbrite.co.uk-1996329278612-2026-09-20",
        "eventbrite.co.uk-1996329278612-2026-09-27",
        "eventbrite.co.uk-1996329278612-2026-10-03",
        "eventbrite.co.uk-1996329278612-2026-10-09",
        "eventbrite.co.uk-1996329278612-2026-10-25",
      ]);
    });

    it("resolves each date against the event's range, not the current date", () => {
      // December falls in the year the season started, January in the next one.
      const { event, details } = buildEvent(
        [
          "Sunday 6th December: 6.30pm - Quadrophenia (1979)",
          "Sunday 3rd January: 6.30pm - Quadrophenia (1979)",
          "",
          oneFilmSynopsis,
        ].join("\n"),
        { start_date: "2026-12-06", end_date: "2027-01-03", end_time: "23:30" },
      );

      const output = expandLineUpEvent(event, details);

      expect(
        output.map(({ performances }) =>
          new Date(performances[0].time).toISOString(),
        ),
      ).toEqual(["2026-12-06T18:30:00.000Z", "2027-01-03T18:30:00.000Z"]);
    });

    it("throws when a line-up entry names a film with no synopsis", () => {
      const { event, details } = buildEvent(
        [
          "Sunday 30th August: 6.30pm - Some Other Film (1985)",
          "",
          oneFilmSynopsis,
        ].join("\n"),
      );

      expect(() => expandLineUpEvent(event, details)).toThrow(
        /No synopsis found for line-up entry/,
      );
    });

    it("throws when a line-up entry's day of the week is wrong", () => {
      const details = JSON.parse(JSON.stringify(rebelParty.details));
      const module =
        details.props.pageProps.context.structuredContent.modules[0];
      module.text = module.text.replace(
        "Sunday 30th August",
        "Monday 30th August",
      );

      expect(() => expandLineUpEvent(rebelParty.event, details)).toThrow(
        /says Monday but .* is a sunday/,
      );
    });

    it("throws when a line-up date falls outside the event's range", () => {
      const { event, details } = buildEvent(
        [
          "Sunday 1st March: 6.30pm - Quadrophenia (1979)",
          "",
          oneFilmSynopsis,
        ].join("\n"),
      );

      expect(() => expandLineUpEvent(event, details)).toThrow(
        /Unable to resolve a single year/,
      );
    });

    it("throws when the description has no film details at all", () => {
      const { event, details } = buildEvent("Come along to our season!");

      expect(() => expandLineUpEvent(event, details)).toThrow(
        /Expected film details in the description/,
      );
    });

    it("throws when the description has synopses but no line-up", () => {
      const { event, details } = buildEvent(oneFilmSynopsis);

      expect(() => expandLineUpEvent(event, details)).toThrow(
        /Expected a line-up in the description/,
      );
    });
  });
});

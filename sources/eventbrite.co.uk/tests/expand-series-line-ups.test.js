const { schemaValidate } = require("../../../common/test-utils");
const {
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const {
  getLineUpSeriesId,
  expandSeriesLineUp,
} = require("../expand-series-line-ups");
const griffin = require("./fixtures/griffin-halloween.json");
const diasporic = require("./fixtures/ual-diasporic-films.json");

// As with expand-line-up-events.test.js, the parser is exercised directly
// against a captured event page and the series' sessions rather than through
// retrieve().

const clone = (value) => JSON.parse(JSON.stringify(value));

// The fixture's description, with one line swapped for another.
const withDescription = (replace, fixture = griffin) => {
  const details = clone(fixture.details);
  const module = details.props.pageProps.context.structuredContent.modules.find(
    ({ type }) => type === "text",
  );
  module.text = replace(module.text);
  return details;
};

describe("expand-series-line-ups", () => {
  describe("getLineUpSeriesId", () => {
    it("recognises a session of an allow-listed series", () => {
      expect(getLineUpSeriesId(griffin.details)).toBe("2002714960358");
    });

    it("leaves every other series alone", () => {
      const details = clone(griffin.details);
      details.props.pageProps.context.basicInfo.seriesId = "1234567890";
      expect(getLineUpSeriesId(details)).toBeNull();
    });

    it("leaves events that aren't a series alone", () => {
      const details = clone(griffin.details);
      details.props.pageProps.context.basicInfo.isSeries = false;
      expect(getLineUpSeriesId(details)).toBeNull();
    });

    it("recognises a session of UAL's Diasporic Films series", () => {
      expect(getLineUpSeriesId(diasporic.details)).toBe("2002518087506");
    });

    it("copes with an event whose page could not be read", () => {
      expect(getLineUpSeriesId(undefined)).toBeNull();
    });
  });

  describe("expandSeriesLineUp", () => {
    it("expands The Griffin's Halloween series into one showing per night", () => {
      const output = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions,
      );

      expect(output).toHaveLength(5);
      expect(output.map(({ title }) => title)).toEqual([
        "The Craft",
        "Scream",
        "The Blair Witch Project",
        "Halloween",
        "Hocus Pocus",
      ]);

      const data = clone(output).map(removeMatchingHints).map(addTestCategory);
      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    });

    it("takes each night's time, id and checkout from its own session", () => {
      const output = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions,
      );

      expect(
        output.map(({ showingId, url, performances: [performance] }) => ({
          showingId,
          url,
          time: new Date(performance.time).toISOString(),
          bookingUrl: performance.bookingUrl,
        })),
      ).toEqual(
        [
          ["2002715002484", "2026-10-26T19:00:00.000Z"],
          ["2002715003487", "2026-10-27T19:00:00.000Z"],
          ["2002715004490", "2026-10-28T19:00:00.000Z"],
          ["2002715005493", "2026-10-29T19:00:00.000Z"],
          ["2002715006496", "2026-10-30T19:00:00.000Z"],
        ].map(([id, time]) => ({
          showingId: `eventbrite.co.uk-${id}`,
          url: `https://www.eventbrite.com/e/halloween-on-the-screen-at-the-griffin-tickets-${id}`,
          // 19:00 every night, all after the clocks go back on the 25th.
          time,
          bookingUrl: `https://www.eventbrite.com/checkout-external?eid=${id}`,
        })),
      );
    });

    it("keeps a night's billing out of the film's title", () => {
      const hocusPocus = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions,
      ).at(-1);

      expect(hocusPocus.title).toBe("Hocus Pocus");
      expect(hocusPocus.performances[0].notes).toBe(
        "with Halloween Party to follow £10 a ticket",
      );
    });

    it("names only that night's film, never the whole season", () => {
      const [theCraft] = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions,
      );

      expect(theCraft.matchingHints.overview).toMatch(/The Craft/);
      expect(theCraft.matchingHints.overview).not.toMatch(/Scream/);
      expect(theCraft.matchingHints.overview).not.toMatch(/Five films/);
    });

    it("only reports availability for the session whose page was fetched", () => {
      const output = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions,
      );

      expect(output[0].performances[0].status).toEqual({ soldOut: false });
      for (const { performances } of output.slice(1)) {
        expect(performances[0].status).toEqual({});
      }
    });

    it("skips a night that has passed and dropped out of the series", () => {
      const output = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        griffin.sessions.slice(1),
      );

      expect(output.map(({ title }) => title)).toEqual([
        "Scream",
        "The Blair Witch Project",
        "Halloween",
        "Hocus Pocus",
      ]);
    });

    it("skips a cancelled session", () => {
      const sessions = clone(griffin.sessions);
      sessions[2].status = "canceled";

      const output = expandSeriesLineUp(
        griffin.event,
        griffin.details,
        sessions,
      );

      expect(output.map(({ title }) => title)).not.toContain(
        "The Blair Witch Project",
      );
    });

    it("throws when a line-up entry later in the run has no session", () => {
      const sessions = griffin.sessions.filter((_, index) => index !== 2);

      expect(() =>
        expandSeriesLineUp(griffin.event, griffin.details, sessions),
      ).toThrow(
        /"📹 Wednesday 28th: The Blair Witch Project" .* has no session/,
      );
    });

    it("throws when a session has no line-up entry", () => {
      const details = withDescription((text) =>
        text.replace(
          /🎃 Thursday 29th: <strong><strong>Halloween<\/strong><\/strong><br>/,
          "",
        ),
      );

      expect(() =>
        expandSeriesLineUp(griffin.event, details, griffin.sessions),
      ).toThrow(/Expected one line-up entry for the Thu Oct 29 2026 session/);
    });

    it("throws when a line-up entry's day of the week is wrong", () => {
      const details = withDescription((text) =>
        text.replace("Monday 26th", "Tuesday 26th"),
      );

      expect(() =>
        expandSeriesLineUp(griffin.event, details, griffin.sessions),
      ).toThrow(/says tuesday but .* is a monday/);
    });

    it("throws when a session is at a different venue", () => {
      const sessions = clone(griffin.sessions);
      sessions[1].venue_id = "1";

      expect(() =>
        expandSeriesLineUp(griffin.event, griffin.details, sessions),
      ).toThrow(/is at venue 1/);
    });

    it("throws when the series' sessions were not retrieved", () => {
      expect(() =>
        expandSeriesLineUp(griffin.event, griffin.details, undefined),
      ).toThrow(/Expected the sessions of series 2002714960358/);
    });

    it("throws when the description has no line-up", () => {
      const details = withDescription(() => "<p>Come along!</p>");

      expect(() =>
        expandSeriesLineUp(griffin.event, details, griffin.sessions),
      ).toThrow(/Expected a line-up in the description/);
    });
  });
  describe("expandSeriesLineUp with a dated list", () => {
    const expand = (
      details = diasporic.details,
      sessions = diasporic.sessions,
    ) => expandSeriesLineUp(diasporic.event, details, sessions);

    it("expands UAL's Diasporic Films series into one showing per night", () => {
      const output = expand();

      // The October nights have passed and dropped out of the series, though
      // the description still lists them.
      expect(output).toHaveLength(4);
      expect(output.map(({ title }) => title)).toEqual([
        "SURPRISE STUDENT SCREENING PICK + INTRO.",
        "SURPRISE STUDENT SCREENING PICK + INTRO.",
        "NEWS FROM HOME",
        "QUEEN OF MY DREAMS",
      ]);
      expect(
        output.map(({ showingId, performances: [performance] }) => ({
          showingId,
          time: new Date(performance.time).toISOString(),
        })),
      ).toEqual(
        [
          ["2002518246983", "2026-11-04T18:00:00.000Z"],
          ["2002518247986", "2026-11-11T18:00:00.000Z"],
          ["2002518248989", "2026-11-18T18:00:00.000Z"],
          ["2002518249992", "2026-11-25T18:00:00.000Z"],
        ].map(([id, time]) => ({
          showingId: `eventbrite.co.uk-${id}`,
          time,
        })),
      );

      const data = clone(output).map(removeMatchingHints).map(addTestCategory);
      expect(schemaValidate(data)).toBe(true);
      expect(data).toMatchSnapshot();
    });

    it("takes the year from the list, and leaves it off a night without one", () => {
      const output = expand();

      expect(output.map(({ overview }) => overview.year)).toEqual([
        undefined,
        undefined,
        "1976",
        "2023",
      ]);
    });

    it("gives each night only its own synopsis", () => {
      const newsFromHome = expand().at(-2);

      expect(newsFromHome.matchingHints.overview).toMatch(/Chantal Akerman/);
      expect(newsFromHome.matchingHints.overview).not.toMatch(/Bollywood/);
      // A synopsis is not billing for the night.
      expect(newsFromHome.performances[0].notes).not.toMatch(/Akerman/);
    });

    it("picks up a film once the organiser names it", () => {
      const details = withDescription(
        (text) =>
          text.replace(
            "<li>04/11, *SURPRISE STUDENT SCREENING PICK + INTRO.* - Announced week of event.</li>",
            '<li>04/11, <a href="https://example.com">LA HAINE</a> (1995) - Three friends.</li>',
          ),
        diasporic,
      );

      const [first] = expand(details);
      expect(first.title).toBe("LA HAINE");
      expect(first.overview.year).toBe("1995");
    });

    it("throws when a list entry's month doesn't match its session", () => {
      const details = withDescription(
        (text) => text.replace("<li>18/11,", "<li>18/12,"),
        diasporic,
      );

      expect(() => expand(details)).toThrow(
        /Expected one line-up entry for the Wed Nov 18 2026 session/,
      );
    });
  });
});

const transform = require("../transform");

const attributes = {
  id: "tate.org.uk-tate-modern",
  name: "Tate Modern",
  domain: "https://www.tate.org.uk",
};

const EVENT_URL =
  "https://www.tate.org.uk/whats-on/tate-modern/frida-kahlo-the-making-of-an-icon/film-screening-salma-hayek-frida";

const ACCESSIBILITY_PANEL_TEXT =
  "Ear defenders can be borrowed from the Ticket desks.";

// The fields transform reads from an event page. Dates are given exactly as
// Tate renders them: several dates share one element, separated by <br>.
const eventPage = ({ dates, soldOut = false, programme } = {}) => `
  <article class="event">
    ${
      soldOut
        ? '<span class="banner__status-alert-headline">This event has sold out</span>'
        : ""
    }
    <h1>Film Screening: Frida</h1>
    <span class="splash-header__dates">${dates}</span>
    ${soldOut ? "" : '<a href="https://shop.tate.org.uk/ticket/date?cgid=397342">Book</a>'}
    <div class="content__standfirst">Join us to watch biographical film Frida.</div>
    <div class="container__inner">
      <div class="block-rich_text"><p>Directed by Julie Taymor.</p></div>
    </div>
    ${
      programme
        ? `<div class="accordion__item">
             <span class="accordion__title">Programme</span>
             <div class="accordion__content">${programme}</div>
           </div>`
        : ""
    }
    <div class="accordion__item">
      <span class="accordion__title">Accessibility</span>
      <div class="accordion__content">${ACCESSIBILITY_PANEL_TEXT}</div>
    </div>
  </article>
`;

const runTransform = (options) =>
  transform(
    attributes,
    { moviePages: { [EVENT_URL]: eventPage(options) } },
    {},
  );

const timesOf = (movies) => movies[0].performances.map(({ time }) => time);

describe("Tate transform", () => {
  it("reads every date of an event that runs on several dates", async () => {
    const movies = await runTransform({
      dates:
        "7 August 2026 at 19.00–21.00<br>8 August 2026 at 19.00–21.00<br>15 August 2026 at 19.00–21.00",
    });

    expect(movies).toHaveLength(1);
    expect(timesOf(movies)).toEqual([
      new Date("2026-08-07T19:00:00+01:00").getTime(),
      new Date("2026-08-08T19:00:00+01:00").getTime(),
      new Date("2026-08-15T19:00:00+01:00").getTime(),
    ]);
  });

  it("expands a run of daily screenings into one performance per day", async () => {
    const movies = await runTransform({
      dates: "17 - 23 August 2026 11.00 - 14.00",
    });

    expect(timesOf(movies)).toEqual([
      new Date("2026-08-17T11:00:00+01:00").getTime(),
      new Date("2026-08-18T11:00:00+01:00").getTime(),
      new Date("2026-08-19T11:00:00+01:00").getTime(),
      new Date("2026-08-20T11:00:00+01:00").getTime(),
      new Date("2026-08-21T11:00:00+01:00").getTime(),
      new Date("2026-08-22T11:00:00+01:00").getTime(),
      new Date("2026-08-23T11:00:00+01:00").getTime(),
    ]);
  });

  it("carries a start month when a run crosses into the next month", async () => {
    const movies = await runTransform({
      dates: "30 August - 1 September 2026 11.00 - 14.00",
    });

    expect(timesOf(movies)).toEqual([
      new Date("2026-08-30T11:00:00+01:00").getTime(),
      new Date("2026-08-31T11:00:00+01:00").getTime(),
      new Date("2026-09-01T11:00:00+01:00").getTime(),
    ]);
  });

  it("applies the sold out banner to every date the event runs", async () => {
    const movies = await runTransform({
      dates:
        "7 August 2026 at 19.00–21.00<br>8 August 2026 at 19.00–21.00<br>15 August 2026 at 19.00–21.00",
      soldOut: true,
    });

    expect(movies[0].performances).toHaveLength(3);
    expect(movies[0].performances.map(({ status }) => status)).toEqual([
      { soldOut: true },
      { soldOut: true },
      { soldOut: true },
    ]);
  });

  it("leaves status empty when the event is still on sale", async () => {
    const movies = await runTransform({
      dates: "15 August 2026 at 19.00–21.00",
    });

    expect(movies[0].performances[0].status).toEqual({});
    expect(movies[0].performances[0].bookingUrl).toEqual(
      "https://shop.tate.org.uk/ticket/date?cgid=397342",
    );
  });

  it("falls back to the event page for booking once an event has sold out", async () => {
    const movies = await runTransform({
      dates: "15 August 2026 at 19.00–21.00",
      soldOut: true,
    });

    expect(movies[0].performances[0].bookingUrl).toEqual(EVENT_URL);
  });

  it("adds the programme listing to the matching hints, without the venue panels", async () => {
    const movies = await runTransform({
      dates: "15 August 2026 at 19.00–21.00",
      programme:
        "Kaka Yo, Sébastien Kamba, 1966 (République du Congo) - 28 min",
    });

    expect(movies[0].matchingHints.overview).toContain("Sébastien Kamba");
    expect(movies[0].matchingHints.overview).not.toContain(
      ACCESSIBILITY_PANEL_TEXT,
    );
  });

  it("throws rather than dropping a screening it cannot read a date from", async () => {
    await expect(
      runTransform({ dates: "Every Tuesday this autumn" }),
    ).rejects.toThrow("unrecognised date format");
  });
});

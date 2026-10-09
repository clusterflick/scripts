const { isFilmEvent, parseEventDate } = require("../utils");

describe("parseEventDate", () => {
  it.each([
    ["Sunday 11 October 2026, 7.30pm", "2026-10-11T18:30:00.000Z"],
    ["Sunday 11 October 2026, 2–5pm", "2026-10-11T13:00:00.000Z"],
    ["Thursday 29 October 2026, 7.30–11pm", "2026-10-29T19:30:00.000Z"],
    ["Saturday 14 November 2026, 11am–2pm", "2026-11-14T11:00:00.000Z"],
    ["Friday 4 December 2026, 8pm", "2026-12-04T20:00:00.000Z"],
  ])("parses %s", (dateText, expected) => {
    expect(parseEventDate(dateText).toISOString()).toBe(expected);
  });

  it.each([
    // A run's own date - its nights are parsed instead
    "29–31 October 2026",
    // The archive drops the time
    "Sunday 11 October 2026",
  ])("throws on %s", (dateText) => {
    expect(() => parseEventDate(dateText)).toThrow();
  });
});

describe("isFilmEvent", () => {
  it.each([
    "Sonic Cinema: Tony Conrad’s Loose Connection + Billy Steiger",
    "Upset the Rhythm: Grouper + short film screening",
    "Leo Records – MATINEE: SAINKHO NAMTCHYLAK / MIA ZABELKA + SIMON NABATOV + Film screening: 'Leo Records: Strictly For Our Friends'",
  ])("keeps %s", (title) => {
    expect(isFilmEvent(title)).toBe(true);
  });

  it.each([
    "Fred Frith Residency: Fred Frith / Tim Hodgkinson / Liz Allbee (trio)",
    "Delphine Joussein: CALAMITY + Marjolaine Charbin",
  ])("drops %s", (title) => {
    expect(isFilmEvent(title)).toBe(false);
  });
});

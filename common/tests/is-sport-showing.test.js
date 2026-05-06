const { isSportShowing, isNotSportShowing } = require("../is-sport-showing");

describe("isSportShowing", () => {
  test.each([
    ["FA Cup Screening"],
    ["Arsenal vs Chelsea: FA Cup Screening"],
    ["FA Cup Final Screening"],
    ["MAN CITY V LIVERPOOL: FA CUP QUARTER-FINAL SCREENING"],
    ["Premier League Screening"],
    ["UEFA Champions League Screening"],
    ["Union Jack Classic"],
    ["Union Jack Classic: Darts"],
    ["Super Bowl LIX"],
    ["Super Bowl Party"],
    ["Six Nations: England v France"],
    ["Six Nations Rugby"],
    ["AFCON 2024: Nigeria v South Africa"],
    ["GRAND PRIX: Monaco"],
    ["F1 GRAND PRIX: British"],
    ["Chelsea FANPARK: Champions League Final"],
    ["Arsenal FANPARK: North London Derby"],
    ["World Cup Final"],
    ["FIFA World Cup Final 2026"],
    ["ENGLAND V CROATIA: WORLD CUP 2026 (WEMBLEY)"],
    ["FIFA World Cup Live Screenings"],
    ["Wimbledon Live Screenings & Activities"],
  ])("flags '%s' as a sport showing", (title) => {
    expect(isSportShowing({ title })).toBe(true);
  });

  test.each([
    ["The Cup"],
    ["Screening"],
    ["League of Their Own"],
    ["Bowl of Cherries"],
    ["Six Degrees of Separation"],
    ["Grand Prix (1966)"],
    ["Fanatic"],
  ])("does not flag '%s' as a sport showing", (title) => {
    expect(isSportShowing({ title })).toBe(false);
  });
});

describe("isNotSportShowing", () => {
  test("returns true for non-sport events", () => {
    expect(isNotSportShowing({ title: "The Wild Robot" })).toBe(true);
  });

  test("returns false for sport events", () => {
    expect(isNotSportShowing({ title: "FA Cup Screening" })).toBe(false);
  });
});

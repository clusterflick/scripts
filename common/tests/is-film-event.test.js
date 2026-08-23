const { isFilmEvent } = require("../is-film-event");

describe("isFilmEvent", () => {
  test.each([
    ["Film Club: The Return"],
    ["Sunday Film Screening"],
    ["A screening of Nosferatu with live score"],
    ["An evening of short films from the archive"],
    ["Open air cinema in the park"],
  ])("flags '%s' as a film event", (text) => {
    expect(isFilmEvent(text)).toBe(true);
  });

  test.each([
    ["Monteverdi Choir - Rossini's Petite Messe Solennelle"],
    ["Friday Night is Music Night with Joe Stilgoe"],
    ["Gary Delaney - Gary On Laughing"],
    ["London Squash Classic"],
    ["Crafternoon"],
    ["Petit Pierre From Transylvania (Ages 3 to 103)"],
  ])("does not flag '%s'", (text) => {
    expect(isFilmEvent(text)).toBe(false);
  });

  // A phrase first seen at one venue is shared with all of them, so the
  // venue's own name for its film strand counts everywhere
  it("flags a venue's own name for its film strand", () => {
    expect(isFilmEvent("The Playhouse Buster Keaton Cineclub")).toBe(true);
  });

  it("matches a keyword in the description when the title has none", () => {
    expect(
      isFilmEvent(
        "Wallace & Gromit with live brass band - the score performed live " +
          "alongside the action on screen",
      ),
    ).toBe(true);
  });
});

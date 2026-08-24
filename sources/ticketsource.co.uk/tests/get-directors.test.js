const getDirectors = require("../get-directors");

// TicketSource venues write their own event copy, so the credit turns up in
// every shape from a bare line to the opening clause of a paragraph. The
// synopses below are the wordings seen in the recorded events.

describe("getDirectors", () => {
  it.each([
    // A line of its own, which is the shape the credit usually takes
    [
      "Directed by Ali Ray\n\nPierre-Auguste Renoir is one of the world's",
      ["Ali Ray"],
    ],
    [
      "Directed by Indhu Rubasingham\n\nAward-winner Sandra Oh plays the role",
      ["Indhu Rubasingham"],
    ],
    // Opening a sentence, so the credit ends at the comma rather than the line
    [
      "Directed by BAFTA nominees Iain Forsyth and Jane Pollard, Broken English is a portrait of Marianne Faithfull starring Tilda Swinton, George MacKay and Nick Cave.",
      ["BAFTA nominees Iain Forsyth", "Jane Pollard"],
    ],
    [
      "Directed by filmmaker James Ewen, the 20-minute documentary follows the band",
      ["filmmaker James Ewen"],
    ],
    // Followed by the rest of the billing, separated by slashes
    [
      "Directed by Anthony Asquith / 89 mins / PG certificate",
      ["Anthony Asquith"],
    ],
    // A closing full stop is not part of the name
    ["Directed by Stephen Daldry.", ["Stephen Daldry"]],
    // ... but the full stops in initials are
    [
      "Directed by J.J. Abrams, this sequel picks up where the last left off",
      ["J.J. Abrams"],
    ],
    // Placeholders are no use for matching
    ["Directed by Various Directors, an anthology of shorts", undefined],
    // No credit at all
    ["A wonderful evening of film, with a bar open until late", undefined],
  ])("reads the directors out of %j", (synopsis, expected) => {
    expect(getDirectors(synopsis)).toEqual(expected);
  });

  // The regression that took out a whole venue's transform: the credit ran to
  // the end of the line, so a paragraph opening "Directed by" was captured
  // whole and used as a person's name, building a cache filename past the
  // filesystem's 255 byte limit.
  it("never returns a name long enough to be prose", () => {
    const synopsis =
      "Directed by BAFTA nominees Iain Forsyth and Jane Pollard, Broken English is a portrait of Marianne Faithfull starring Tilda Swinton, George MacKay, Nick Cave, Suki Waterhouse and Courtney Love. Drawing on interviews, archival material and Faithfull's final recorded performance, this genre-defying documentary traces a life shaped by fame and reinvention.";

    for (const name of getDirectors(synopsis)) {
      expect(name.length).toBeLessThan(60);
    }
  });
});

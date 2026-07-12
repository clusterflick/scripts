const { stripNoteLabels } = require("../utils");

describe("stripNoteLabels", () => {
  const noteLabels = {
    strip: ["Dolby Atmos", "Laser"],
    drop: ["Event"],
  };

  test("keeps the label alone for a stripped label's gloss description", () => {
    expect(
      stripNoteLabels(
        ["Dolby Atmos: Screenings that use Dolby Atmos sound"],
        noteLabels,
      ),
    ).toEqual(["Dolby Atmos"]);
  });

  test("removes a dropped label entirely", () => {
    expect(
      stripNoteLabels(
        ["Event: The very best of theatre, dance, opera, music and tv"],
        noteLabels,
      ),
    ).toEqual([]);
  });

  test("passes through an info-bearing note untouched", () => {
    const notes = [
      "Over 18s: Shows only those aged 18+ can attend - ID may be required",
    ];
    expect(stripNoteLabels(notes, noteLabels)).toEqual(notes);
  });

  test("passes through a bare label with no description", () => {
    expect(stripNoteLabels(["Requires 3D glasses"], noteLabels)).toEqual([
      "Requires 3D glasses",
    ]);
  });

  test("applies strip, drop and pass-through across a mixed list", () => {
    expect(
      stripNoteLabels(
        [
          "Laser: Films played from a laser projector.",
          "Event: The very best of theatre",
          "Silver Screen: Over-60s enjoy discounted tickets",
        ],
        noteLabels,
      ),
    ).toEqual(["Laser", "Silver Screen: Over-60s enjoy discounted tickets"]);
  });

  test("passes every note through when no label lists are given", () => {
    const notes = ["Dolby Atmos: some gloss", "Event: some blurb"];
    expect(stripNoteLabels(notes, {})).toEqual(notes);
    expect(stripNoteLabels(notes)).toEqual(notes);
  });

  test("matches only the first ': ' separator", () => {
    expect(
      stripNoteLabels(["Laser: Barco: brighter", "Event"], {
        strip: ["Laser"],
        drop: ["Event"],
      }),
    ).toEqual(["Laser"]);
  });
});

const stripDateSuffix = require("../strip-date-suffix");

describe("stripDateSuffix", () => {
  test("drops a day-and-month sitting", () => {
    expect(stripDateSuffix("The Blinking Buzzards – 10 July")).toEqual(
      "The Blinking Buzzards",
    );
  });

  test("drops an ordinal day", () => {
    expect(stripDateSuffix("Exploding Cinema – 30th October")).toEqual(
      "Exploding Cinema",
    );
  });

  test("drops a month-first sitting", () => {
    expect(stripDateSuffix("Thelma & Louise - Sept. 4")).toEqual(
      "Thelma & Louise",
    );
  });

  test("drops a weekday and year around the date", () => {
    expect(stripDateSuffix("Nightclub – Fri 3 Oct 2026")).toEqual("Nightclub");
  });

  test("drops a date set off with a pipe", () => {
    expect(stripDateSuffix("Some Strand | 12 Dec")).toEqual("Some Strand");
  });

  test("leaves only the last date when the title carries several segments", () => {
    expect(
      stripDateSuffix("Ocean Film Festival - London - 20 October 2026"),
    ).toEqual("Ocean Film Festival - London");
  });

  test("keeps a title with no date", () => {
    expect(stripDateSuffix("The Blinking Buzzards")).toEqual(
      "The Blinking Buzzards",
    );
  });

  test("keeps a month that is part of the name", () => {
    expect(stripDateSuffix("Sunday Bloody Sunday")).toEqual(
      "Sunday Bloody Sunday",
    );
  });

  test("keeps a trailing number that isn't a date", () => {
    expect(stripDateSuffix("Summer of 85")).toEqual("Summer of 85");
  });

  test("keeps a leading number", () => {
    expect(stripDateSuffix("10 Things I Hate About You")).toEqual(
      "10 Things I Hate About You",
    );
  });

  test("keeps a title that is nothing but a date", () => {
    expect(stripDateSuffix("– 10 July")).toEqual("– 10 July");
  });

  test("drops an undashed date when the group holds several", () => {
    expect(
      stripDateSuffix("KB event Jan 6", [
        "KB event Jan 6",
        "KB event Apr 7",
        "KB events Apr 28",
      ]),
    ).toEqual("KB event");
  });

  test("keeps an undashed date the whole group shares", () => {
    expect(
      stripDateSuffix("September 5", ["September 5", "September 5"]),
    ).toEqual("September 5");
  });

  test("keeps an undashed date without the group", () => {
    expect(stripDateSuffix("KB event Jan 6")).toEqual("KB event Jan 6");
  });

  test("handles an empty title", () => {
    expect(stripDateSuffix()).toEqual("");
  });
});

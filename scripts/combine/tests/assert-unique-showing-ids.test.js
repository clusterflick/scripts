const assertUniqueShowingIds = require("../assert-unique-showing-ids");

const venue = (...showingIds) => ({
  movies: showingIds.map((showingId) => ({ showingId })),
});

describe("assertUniqueShowingIds", () => {
  it("accepts showing ids that each belong to one venue", () => {
    expect(() =>
      assertUniqueShowingIds({
        "bbk.ac.uk-central": venue("eventbrite.co.uk-1", "bbk.ac.uk-2"),
        "bbk.ac.uk-cinema": venue("bbk.ac.uk-3"),
      }),
    ).not.toThrow();
  });

  it("accepts a venue with no movies", () => {
    expect(() =>
      assertUniqueShowingIds({ "bbk.ac.uk-cinema": venue() }),
    ).not.toThrow();
  });

  // The Birkbeck case: one Eventbrite event matching two venues that share a
  // name and sit 300m apart.
  it("throws when two venues claim the same showing id", () => {
    expect(() =>
      assertUniqueShowingIds({
        "bbk.ac.uk-central": venue("eventbrite.co.uk-1997687300492"),
        "bbk.ac.uk-cinema": venue("eventbrite.co.uk-1997687300492"),
      }),
    ).toThrow(
      /eventbrite\.co\.uk-1997687300492 -> bbk\.ac\.uk-central, bbk\.ac\.uk-cinema/,
    );
  });

  it("throws when one venue lists the same showing id twice", () => {
    expect(() =>
      assertUniqueShowingIds({
        "bbk.ac.uk-cinema": venue("bbk.ac.uk-1", "bbk.ac.uk-1"),
      }),
    ).toThrow(/bbk\.ac\.uk-1 -> bbk\.ac\.uk-cinema, bbk\.ac\.uk-cinema/);
  });

  it("reports every colliding showing id", () => {
    expect(() =>
      assertUniqueShowingIds({
        a: venue("x", "y"),
        b: venue("x", "y"),
      }),
    ).toThrow(/x -> a, b\n {2}y -> a, b/);
  });
});

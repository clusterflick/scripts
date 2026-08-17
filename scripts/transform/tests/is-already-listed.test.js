const isAlreadyListed = require("../is-already-listed");

describe("isAlreadyListed", () => {
  const time = 1756486800000;
  const performance = (bookingUrl, overrides = {}) => ({
    time,
    bookingUrl,
    ...overrides,
  });
  const movie = (...performances) => ({ performances });

  // The Rio sends bookings for a Japanese Film Club night to the organiser's
  // seat-select page while the source links its own per-performance page — the
  // same screening, spelled two ways, so the sourced copy was dropped this run.
  it("recognises a copy booked through the same organiser at the same time", () => {
    expect(
      isAlreadyListed(
        [
          performance(
            "https://japanesefilm.club/the-night-is-short-walk-on-girl-rio-cinema-dalston-2026-08-29-1745/",
          ),
        ],
        [
          movie(
            performance(
              "https://japanesefilm.club/seat-select/?scr_film=5831&scr_id=6a4bb4e4461de",
            ),
          ),
        ],
      ),
    ).toBe(true);
  });

  it("recognises a copy regardless of a www prefix", () => {
    expect(
      isAlreadyListed(
        [
          performance(
            "https://www.outsavvy.com/event/38387/goodbye-dragon-inn",
          ),
        ],
        [movie(performance("https://outsavvy.com/event/38387/"))],
      ),
    ).toBe(true);
  });

  it("keeps a copy booked through a different organiser", () => {
    expect(
      isAlreadyListed(
        [performance("https://dice.fm/event/923qa7-taxi-driver-1976")],
        [movie(performance("https://www.tickettailor.com/events/mid/2296077"))],
      ),
    ).toBe(false);
  });

  it("keeps a copy at a time we hold nothing for", () => {
    expect(
      isAlreadyListed(
        [
          performance("https://japanesefilm.club/other-night/", {
            time: time + 3600000,
          }),
        ],
        [movie(performance("https://japanesefilm.club/shall-we-dance/"))],
      ),
    ).toBe(false);
  });

  // A booking URL we can't read a host from identifies nothing, so it must not
  // become a key that matches every other performance lacking one too.
  it("never treats a missing booking url as a match", () => {
    expect(isAlreadyListed([performance("")], [movie(performance(""))])).toBe(
      false,
    );
  });

  // A run of a film has to be matched in full — a copy carrying a date the
  // venue doesn't list is telling us something we'd otherwise lose.
  it("keeps a copy when only some of its performances are held", () => {
    expect(
      isAlreadyListed(
        [
          performance("https://outsavvy.com/event/38387/"),
          performance("https://outsavvy.com/event/38387/", {
            time: time + 86400000,
          }),
        ],
        [movie(performance("https://www.outsavvy.com/event/38387/"))],
      ),
    ).toBe(false);
  });

  it("keeps a copy when this run holds nothing at all", () => {
    expect(
      isAlreadyListed([performance("https://outsavvy.com/event/38387/")], []),
    ).toBe(false);
  });
});

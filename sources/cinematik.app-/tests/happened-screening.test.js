const { isHappenedScreeningPage } = require("../utils");

const CATTERICK =
  "https://escapes.cinematik.app/book/i-see-buildings-fall-like-lightning-relaxed-screenings-savoy-cinemas-ltd-savoy-cinema-catterick-2026-11-24";

// Trimmed from the 410 Gone that CATTERICK answered at 19:00 on 24 November
// 2026.
const HAPPENED = `<main><p>The screening for I See Buildings Fall Like Lightning
  (Relaxed Screenings) has now happened. Hope to you see you at the next one!</p>
  <a href="/">See what's on</a></main>`;

const onTheDay = new Date("2026-11-24T19:00:00Z");

describe("isHappenedScreeningPage", () => {
  it("recognises the notice for a screening that has happened", () => {
    expect(isHappenedScreeningPage(CATTERICK, HAPPENED, onTheDay)).toBe(true);
  });

  it("recognises nothing for a screening on a later date", () => {
    const dayBefore = new Date("2026-11-23T12:00:00Z");
    expect(isHappenedScreeningPage(CATTERICK, HAPPENED, dayBefore)).toBe(false);
  });

  it("recognises nothing without the notice", () => {
    expect(
      isHappenedScreeningPage(CATTERICK, "<main>Gone</main>", onTheDay),
    ).toBe(false);
  });
});

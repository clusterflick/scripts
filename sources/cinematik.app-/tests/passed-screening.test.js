const cheerio = require("cheerio");
const { getPassedScreeningEventSlug } = require("../utils");

const origins = [
  "https://www.cinematik.app",
  "https://elevenfiftyfive.cinematik.app",
  "https://escapes.cinematik.app",
  "https://massive.cinematik.app",
];

const SERIES = {
  "@context": "https://schema.org",
  "@type": "EventSeries",
  name: "I See Buildings Fall Like Lightning - 23–24 Nov 2026",
  url: "https://www.cinematik.app/events/i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24",
};

// Trimmed from what
// https://escapes.cinematik.app/book/i-see-buildings-fall-like-lightning-the-ystradgynlais-miners-welfare-and-community-hall-trust-limited-the-welfare-ystradgynlais-2026-11-23
// served on 23 November 2026, after the screening: its event's page.
const page = ({ notice, series = [SERIES] }) => `
  <div id="flash">
    <div class="notice notice-warning" role="alert"><p>${notice}</p></div>
  </div>
  <script type="application/ld+json">${JSON.stringify(series)}</script>`;

const read = (html) => {
  const $ = cheerio.load(html);
  const jsonLd = $('script[type="application/ld+json"]')
    .map((_, el) => JSON.parse($(el).html()))
    .get();
  return getPassedScreeningEventSlug($, jsonLd, origins);
};

describe("getPassedScreeningEventSlug", () => {
  it("reads the event from the page a passed screening redirects to", () => {
    const html = page({
      notice:
        "The screening for I See Buildings Fall Like Lightning has now happened. Hope to you see you at the next one!",
    });
    expect(read(html)).toBe(
      "i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24",
    );
  });

  it("recognises nothing without the notice", () => {
    expect(read(page({ notice: "Booking is closed" }))).toBeUndefined();
  });

  it("throws when the notice names no event", () => {
    const html = page({
      notice: "The screening for Something has now happened.",
      series: [],
    });
    expect(() => read(html)).toThrow(/names no event/);
  });
});

const transform = require("../transform");

// Trimmed from ACF's page for "In Short, Europe" (November 2026): a talk under
// the film tag, held at the Goethe-Institut rather than at ACF.
const eventPage = ({ title, location }) => `<html><body>
  <h1 class="detail-title">${title}</h1>
  <div class="detail-item">Wed 18 Nov 2026</div>
  <div class="detail-item">6:00PM</div>
  <input name="event_id" value="1234" />
  <div class="event-desc">Short film experts from interfilm.</div>
  ${location === undefined ? "" : `<p class="body-text location-block clear">${location}</p>`}
</body></html>`;

const url = "https://www.acflondon.org/events/in-short-europe/";

describe("acf london events held elsewhere", () => {
  // The film tag carries partner events at other venues, so a listing of only
  // those is a real listing with nothing on here, not a broken page.
  it("does not read a listing of only events elsewhere as a broken page", async () => {
    const title = "In Short, Europe: How to Build Success for Your Short Film";
    const location = "Goethe-Institut London<br />50 Princes Gate";
    await expect(
      transform({ moviePages: { [url]: eventPage({ title, location }) } }, {}),
    ).resolves.toEqual([]);
  });

  it("fails when an event page has no location", async () => {
    await expect(
      transform({ moviePages: { [url]: eventPage({ title: "Film" }) } }, {}),
    ).rejects.toThrow("No location found");
  });

  it("fails when no event pages were found at all", async () => {
    await expect(transform({ moviePages: {} }, {})).rejects.toThrow(
      "No movies found - the page structure may have changed",
    );
  });
});

const { fetchWin1252Text } = require("../../../common/utils");
const retrieve = require("../retrieve");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  fetchWin1252Text: jest.fn(),
}));

const domain = "https://www.omniplexcinemas.co.uk";
const date = "2026-11-20";

const indexPage = (dates) =>
  `<script>var allowedDatesTimestamps = ${JSON.stringify(
    dates.map((day) => new Date(`${day}T00:00:00Z`).getTime()),
  )};</script>`;

// The favourite icon sits in the card's info column and the showtimes in a
// sibling one, as on the real page.
const card = (titleLink) => `<div class="card">
  <div class="info">
    <img id="favourite123" />
    <p class="font-medium">${titleLink}</p>
  </div>
  <div class="times"><div class="showTimeBox"></div></div>
</div>`;

const filmPage = "<p class='text'><b>Director:</b> Ti West</p>";
const siteChooser = "<form id='siteList'></form>";

function respondWith(pages) {
  fetchWin1252Text.mockImplementation(async (url) => {
    const path = url.replace(domain, "");
    if (path.startsWith("/cinema/showtimes/sutton?")) return pages.datePage;
    if (path === "/cinema/showtimes/sutton") return pages.indexPage;
    if (path in pages.films) return pages.films[path];
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("omniplex sutton retrieve", () => {
  beforeEach(() => fetchWin1252Text.mockReset());

  it("fetches a page for each card's title link, whatever its shape, with the site cookie", async () => {
    respondWith({
      indexPage: indexPage([date]),
      datePage: card('<a href="/film/ebenezer">Ebenezer</a>'),
      films: { "/film/ebenezer": filmPage },
    });

    const { moviePages } = await retrieve();

    expect(moviePages).toEqual({ [`${domain}/film/ebenezer`]: filmPage });
    expect(fetchWin1252Text).toHaveBeenCalledWith(`${domain}/film/ebenezer`, {
      headers: { cookie: "sitecode=OMP_SUTT" },
    });
  });

  it("throws on a card with no title link", async () => {
    respondWith({
      indexPage: indexPage([date]),
      datePage: card("Ebenezer"),
      films: {},
    });

    await expect(retrieve()).rejects.toThrow(
      `A film card on ${date} has no title link - the showtimes page has changed`,
    );
  });

  it("throws when the dates it lists have no cards", async () => {
    respondWith({
      indexPage: indexPage([date]),
      datePage: "<div>No cards here</div>",
      films: {},
    });

    await expect(retrieve()).rejects.toThrow(
      "Omniplex lists 1 dates but none of their pages has a film card - the showtimes page has changed",
    );
  });

  it("throws when a film page comes back as the site chooser", async () => {
    respondWith({
      indexPage: indexPage([date]),
      datePage: card('<a href="/cinema/movie/ebenezer">Ebenezer</a>'),
      films: { "/cinema/movie/ebenezer": siteChooser },
    });

    await expect(retrieve()).rejects.toThrow(
      `Film page ${domain}/cinema/movie/ebenezer came back as the site chooser - the sitecode cookie (OMP_SUTT) was not accepted`,
    );
  });

  it("returns no film pages for a venue with no dates", async () => {
    respondWith({ indexPage: indexPage([]), datePage: "", films: {} });

    await expect(retrieve()).resolves.toEqual({
      indexPage: indexPage([]),
      datePages: {},
      moviePages: {},
    });
  });
});

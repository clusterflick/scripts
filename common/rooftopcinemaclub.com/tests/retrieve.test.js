const { fetchText } = require("../../utils");
const retrieve = require("../retrieve");

jest.mock("../../utils", () => ({
  ...jest.requireActual("../../utils"),
  fetchText: jest.fn(),
  fetchJson: jest.fn(),
}));

const domain = "https://rooftopcinemaclub.com";
const url = `${domain}/uk/london/peckham`;

const listingPage = (...films) =>
  films
    .map(
      (film) =>
        `<div class="screening-card"><h3><a href="/uk/london/peckham/screenings/${film}">${film}</a></h3></div>`,
    )
    .join("");
// As the site answers the page after the last, and the first out of season
const emptyPage = `<div class="text-center py-16"><p class="text-lg text-brand-navy/60">No upcoming screenings available.</p></div>`;

// Each listing page in turn, then film pages for whatever was linked
function respondWith(listingPages) {
  fetchText.mockImplementation(async (requested) => {
    const page = requested.match(/\/screenings\/list\?page=(\d+)$/)?.[1];
    if (page) return listingPages[page - 1] ?? emptyPage;
    return "<html></html>";
  });
}

const listingRequests = () =>
  fetchText.mock.calls.filter(([requested]) =>
    requested.includes("/screenings/list"),
  );

describe("rooftop cinema club retrieve", () => {
  beforeEach(() => {
    fetchText.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("reads every page up to the empty one", async () => {
    respondWith([listingPage("heat"), listingPage("alien")]);

    const { screeningPages } = await retrieve({ domain, url });

    expect(screeningPages).toHaveLength(2);
    expect(listingRequests()).toHaveLength(3);
  });

  // Out of season
  it("returns nothing when the first page is the empty one", async () => {
    respondWith([]);

    const { screeningPages, filmPages } = await retrieve({ domain, url });

    expect(screeningPages).toEqual([]);
    expect(filmPages).toEqual({});
  });

  it("throws on a page with neither screenings nor the empty message", async () => {
    respondWith([
      listingPage("heat"),
      "<html><title>Just a moment...</title></html>",
      listingPage("alien"),
    ]);

    await expect(retrieve({ domain, url })).rejects.toThrow(
      `${url}/screenings/list?page=2 has neither screenings nor "No upcoming screenings"`,
    );
  });

  it("throws when the listing never runs out", async () => {
    fetchText.mockImplementation(async () => listingPage("heat"));

    await expect(retrieve({ domain, url })).rejects.toThrow(
      "was still listing screenings after 50 pages",
    );
    expect(listingRequests()).toHaveLength(50);
  });
});

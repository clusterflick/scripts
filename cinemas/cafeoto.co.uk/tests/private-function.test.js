const retrieve = require("../retrieve");

const LISTING_URL = "https://www.cafeoto.co.uk/events/";

// One listing page, as Café OTO marks it up: a dated header, then a header
// holding the title and its link.
const listingPage = (events) =>
  `<html><body>${events
    .map(
      ({ date, title, href }) => `<div class="each-activity">
        <div class="each-header"><p>${date}</p></div>
        <div class="each-header"><p><a href="${href}">${title}</a></p></div>
      </div>`,
    )
    .join("")}</body></html>`;

const concert = {
  date: "Tuesday 1 December 2026, 7.30pm",
  title: "Some Band",
  href: "/events/some-band/",
};

const response = (body) => ({
  ok: true,
  status: 200,
  statusText: "",
  headers: { get: () => null },
  text: async () => body,
});

const serveListing = (events) => {
  global.fetch = jest.fn(async (url) => {
    if (url !== LISTING_URL) throw new Error(`Unexpected fetch of ${url}`);
    return response(listingPage(events));
  });
};

describe("Café OTO events without a link", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips a private function, which has no event page", async () => {
    // As listed on 14th October 2026, page 4.
    serveListing([
      {
        date: "Wednesday 2 December 2026, 9am",
        title: "CLOSED FOR PRIVATE FUNCTION",
        href: "",
      },
      concert,
    ]);

    const { movieListPages, moviePages } = await retrieve();

    expect(movieListPages).toHaveLength(1);
    expect(moviePages).toEqual({});
  });

  // A Private Function is a 1984 film - "private" alone must not be enough.
  it("fails on any other event without a link", async () => {
    serveListing([
      {
        date: "Wednesday 2 December 2026, 7pm",
        title: "A Private Function",
        href: "",
      },
      concert,
    ]);

    await expect(retrieve()).rejects.toThrow(
      `No event link for "A Private Function" on ${LISTING_URL}`,
    );
  });
});

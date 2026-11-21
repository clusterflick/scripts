const isCancelledEventPage = require("../is-cancelled-event-page");

describe("isCancelledEventPage", () => {
  const url =
    "https://www.eventbrite.co.uk/e/bar-trash-presents-soylent-green-1973-tickets-2003597973474";

  const page = (...blocks) =>
    `<html><head>${blocks
      .map(
        (block) =>
          `<script type="application/ld+json">${
            typeof block === "string" ? block : JSON.stringify(block)
          }</script>`,
      )
      .join("")}</head><body><span>Cancelled</span></body></html>`;

  // From the Eventbrite page for Bar Trash's Soylent Green at Beer Merchants
  // Tap, cancelled in November 2026 and carried forward by recovery because
  // its visible text says only "Cancelled".
  const eventbriteEvent = (overrides = {}) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: "BAR TRASH presents SOYLENT GREEN (1973)",
    url,
    eventStatus: "https://schema.org/EventCancelled",
    location: { "@type": "Place", name: "Beer Merchants Tap" },
    startDate: "2026-11-22T18:30:00Z",
    endDate: "2026-11-22T21:15:00Z",
    ...overrides,
  });
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "BAR TRASH presents SOYLENT GREEN (1973)",
    url,
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [],
  };

  beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("recognises Eventbrite's cancelled event among its other JSON-LD blocks", () => {
    expect(
      isCancelledEventPage(page(webPage, eventbriteEvent(), breadcrumbs), url),
    ).toBe(true);
  });

  it("keeps a scheduled event", () => {
    expect(
      isCancelledEventPage(
        page(
          webPage,
          eventbriteEvent({ eventStatus: "https://schema.org/EventScheduled" }),
        ),
        url,
      ),
    ).toBe(false);
  });

  it("keeps an event with no status, which schema.org reads as scheduled", () => {
    expect(
      isCancelledEventPage(
        page(eventbriteEvent({ eventStatus: undefined })),
        url,
      ),
    ).toBe(false);
  });

  it("keeps a page with no events in its structured data", () => {
    expect(isCancelledEventPage(page(webPage, breadcrumbs), url)).toBe(false);
    expect(isCancelledEventPage("<html><body>Hi</body></html>", url)).toBe(
      false,
    );
  });

  it.each([
    "http://schema.org/EventCancelled",
    "schema:EventCancelled",
    "EventCancelled",
    "https://schema.org/EventPostponed",
  ])("recognises the status written as %s", (eventStatus) => {
    expect(
      isCancelledEventPage(page(eventbriteEvent({ eventStatus })), url),
    ).toBe(true);
  });

  it.each([
    "https://schema.org/EventRescheduled",
    "https://schema.org/EventMovedOnline",
  ])(
    "keeps an event whose status is %s, which still goes ahead",
    (eventStatus) => {
      expect(
        isCancelledEventPage(page(eventbriteEvent({ eventStatus })), url),
      ).toBe(false);
    },
  );

  it("recognises event subtypes and an @graph", () => {
    expect(
      isCancelledEventPage(
        page({
          "@context": "https://schema.org",
          "@graph": [
            webPage,
            eventbriteEvent({ "@type": ["ScreeningEvent", "Thing"] }),
          ],
        }),
        url,
      ),
    ).toBe(true);
  });

  it("recognises events given as a top-level array", () => {
    expect(isCancelledEventPage(page([webPage, eventbriteEvent()]), url)).toBe(
      true,
    );
  });

  it("keeps a page where only some of its events are cancelled", () => {
    expect(
      isCancelledEventPage(
        page(
          eventbriteEvent(),
          eventbriteEvent({
            startDate: "2026-11-29T18:30:00Z",
            eventStatus: "https://schema.org/EventScheduled",
          }),
        ),
        url,
      ),
    ).toBe(false);
  });

  it("does not read a series' sub-events as the page's own status", () => {
    expect(
      isCancelledEventPage(
        page(
          eventbriteEvent({
            "@type": "EventSeries",
            eventStatus: undefined,
            subEvent: [eventbriteEvent()],
          }),
        ),
        url,
      ),
    ).toBe(false);
  });

  it("skips an unreadable block and still reads the rest", () => {
    expect(
      isCancelledEventPage(page("{ not json", eventbriteEvent()), url),
    ).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      " - Unreadable JSON-LD, ignored:",
      url,
    );
  });
});

const { getEventStatus, getFestivalCollectionNotes } = require("../utils");

// The shapes below are `props.pageProps.context.salesStatus` as the event pages
// in __manual-recordings__ carry it, trimmed to the two fields read here.
const pageWithSalesStatus = (salesStatus) => ({
  props: { pageProps: { context: { salesStatus } } },
});

describe("getEventStatus", () => {
  it.each([
    ["on sale", { salesStatus: "on_sale", messageCode: null }, false],
    [
      "sold out",
      { salesStatus: "sold_out", messageCode: "tickets_sold_out" },
      true,
    ],
    // Selling stopped because there was nothing left to sell: still a sell-out,
    // which is why the message code decides this rather than the status.
    [
      "sold out, then closed",
      { salesStatus: "sales_ended", messageCode: "tickets_sold_out" },
      true,
    ],
    [
      "closed for any other reason",
      { salesStatus: "sales_ended", messageCode: "tickets_with_sales_ended" },
      false,
    ],
    [
      "not yet on sale",
      {
        salesStatus: "not_yet_on_sale",
        messageCode: "tickets_not_yet_on_sale",
      },
      false,
    ],
  ])("reports %s as soldOut: %p", (_, salesStatus, soldOut) => {
    expect(getEventStatus(pageWithSalesStatus(salesStatus))).toEqual({
      soldOut,
    });
  });

  // An unreachable event page leaves us knowing nothing about availability, and
  // "unknown" must not publish as "on sale".
  it.each([
    ["no page at all", undefined],
    ["a page carrying no sales status", { props: { pageProps: {} } }],
  ])("claims nothing from %s", (_, details) => {
    expect(getEventStatus(details)).toEqual({});
  });
});

// The shape below is `props.pageProps.context.collections` as the event pages
// in __manual-recordings__ carry it, trimmed to the field read here.
const pageWithCollections = (...names) => ({
  props: {
    pageProps: { context: { collections: names.map((name) => ({ name })) } },
  },
});

describe("getFestivalCollectionNotes", () => {
  it("notes a collection named as a festival", () => {
    expect(
      getFestivalCollectionNotes(
        pageWithCollections("Windrush International Caribbean Film Festival"),
        "60 Years of Carnival: A history of Steel Pan Pioneer, Jit Samaroo.",
      ),
    ).toEqual(["Part of Windrush International Caribbean Film Festival"]);
  });

  it("notes a festival named as a Fest, tidying its spacing", () => {
    expect(
      getFestivalCollectionNotes(
        pageWithCollections(
          "DzFest - The  Algerian Festival for Arts & Culture",
        ),
        "Algerian Cinema: Short Stories, Big Voices",
      ),
    ).toEqual(["Part of DzFest - The Algerian Festival for Arts & Culture"]);
  });

  it("ignores collections that are not festivals", () => {
    expect(
      getFestivalCollectionNotes(
        pageWithCollections(
          "Leyton Library Events",
          "Business Networking London",
          "Festive Film Screenings",
        ),
        "Some Film",
      ),
    ).toEqual([]);
  });

  it("keeps only the festivals from a mix of collections", () => {
    expect(
      getFestivalCollectionNotes(
        pageWithCollections(
          "Black History 365 - Kensington & Chelsea Libraries",
          "Windrush International Caribbean Film Festival",
        ),
        "Some Film",
      ),
    ).toEqual(["Part of Windrush International Caribbean Film Festival"]);
  });

  it("leaves out a festival the title already names", () => {
    expect(
      getFestivalCollectionNotes(
        pageWithCollections("New Nordic Voices Film Festival"),
        "New Nordic Voices Film Festival: Armand",
      ),
    ).toEqual([]);
  });

  it.each([
    ["no page", undefined],
    ["a page with no collections", { props: { pageProps: { context: {} } } }],
    ["a page with an empty list", pageWithCollections()],
  ])("adds nothing for %s", (_, details) => {
    expect(getFestivalCollectionNotes(details, "Some Film")).toEqual([]);
  });
});

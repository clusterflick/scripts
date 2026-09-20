const { getEventStatus } = require("../utils");

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

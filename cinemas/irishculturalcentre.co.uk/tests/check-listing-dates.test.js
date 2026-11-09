const { checkListingDates } = require("../utils");

const card = (title, date, time) =>
  `<div class="project-post">
    <div class="project-bottom">
      <h3>${title}</h3>
      <div><p>Description</p></div><br>
      <p><strong>${date}</strong></p>
      <p>${time}</p>
    </div>
  </div>`;

const listing = (...cards) =>
  `<div class="search-filter-results">${cards.join("")}</div>`;

describe("checkListingDates", () => {
  it("accepts a listing whose every card has a date", () => {
    expect(() =>
      checkListingDates(
        listing(
          card("Trojan Eddie", "Thu 12 November 2026", "Starts: 7pm"),
          card(
            "Screenwriting Course",
            "Mon 05 October 2026 - Mon 09 November 2026",
            "",
          ),
        ),
      ),
    ).not.toThrow();
  });

  it("accepts a listing with nothing on", () => {
    expect(() => checkListingDates(listing())).not.toThrow();
  });

  // As the listing was served on 9th November 2026.
  it("refuses a listing with a card whose date is blank", () => {
    expect(() =>
      checkListingDates(
        listing(
          card("Trojan Eddie", "Thu 12 November 2026", "Starts: 7pm"),
          card("Báite – London Premiere Screening", " ", ""),
        ),
      ),
    ).toThrow(
      "Listing has 1 event(s) with no date: Báite – London Premiere Screening",
    );
  });
});

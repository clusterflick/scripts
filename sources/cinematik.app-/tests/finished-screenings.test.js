const cheerio = require("cheerio");
const { showsOnlyFinishedScreenings } = require("../utils");

// Rows trimmed from
// https://escapes.cinematik.app/events/i-see-buildings-fall-like-lightning-2026-11-23-2026-11-24
// as recorded on 23 November 2026 ("Book Now") and as served at 19:00 on 24
// November 2026 ("Closed", "Cancelled").
const row = (venue, status) => `
  <div class="flex w-full pb-1 border-b border-white md:border-none">
    <div class="flex flex-col justify-around info-row my-2">
      <div id="title-row" class="flex justify-between"><h2>${venue}</h2></div>
      <div class="flex flex-row justify-between">
        <h2 class="sr-only"> Showing on </h2>
        <h3>Mon 23rd Nov, 14:00</h3>
        <div class="text-right content-start uppercase">
          <div class="py-1 px-2 rounded-md"> ${status} </div>
        </div>
      </div>
    </div>
  </div>`;

const page = (...rows) =>
  cheerio.load(
    `<turbo-frame id="screenings-container">${rows.join("")}</turbo-frame>`,
  );

describe("showsOnlyFinishedScreenings", () => {
  it("recognises a page whose every row is over", () => {
    expect(
      showsOnlyFinishedScreenings(
        page(
          row("The Welfare Ystradgynlais", "Closed"),
          row("Memo Arts Centre, Barry", "Cancelled"),
        ),
      ),
    ).toBe(true);
  });

  it("recognises nothing while a row can still be booked", () => {
    expect(
      showsOnlyFinishedScreenings(
        page(
          row("The Welfare Ystradgynlais", "Closed"),
          row("Scala Cinema Ilkeston", "Book Now"),
        ),
      ),
    ).toBe(false);
  });

  it("recognises nothing on a page with no rows", () => {
    expect(showsOnlyFinishedScreenings(page())).toBe(false);
  });

  it("recognises nothing for a status it doesn't know", () => {
    expect(
      showsOnlyFinishedScreenings(page(row("Curzon Oxford", "Sold Out"))),
    ).toBe(false);
  });
});

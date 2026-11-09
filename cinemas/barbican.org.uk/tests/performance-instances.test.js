const cheerio = require("cheerio");
const { getPerformanceInstances } = require("../utils");

const instance = (href, time) =>
  `<div class="instance-listing">
    <div class="instance-time__time"><time datetime="${time}">${time}</time></div>
    <div class="instance-listing__button"><a href="${href}">Choose seats</a></div>
  </div>`;

// As the LSO's Symphonic Cinema: The Planets listed it on 9th November 2026.
const wildcards = (href) =>
  `<div class="instance-listing additional-instance">
    <div class="instance-listing__meta"></div>
    <div class="instance-listing__button"><a href="${href}">Book wildcards</a></div>
  </div>`;

describe("getPerformanceInstances", () => {
  it("leaves out the wildcard tickets listed under each showing", () => {
    const $ = cheerio.load(
      instance("/choose-seats/3396001", "2027-01-31T18:00:00Z") +
        wildcards("/choose-seats/3409801") +
        instance("/choose-seats/3396201", "2027-01-31T19:45:00Z") +
        wildcards("/choose-seats/3410001"),
    );
    expect(
      getPerformanceInstances($)
        .map((_, el) => $(el).find("time").attr("datetime"))
        .get(),
    ).toEqual(["2027-01-31T18:00:00Z", "2027-01-31T19:45:00Z"]);
  });
});

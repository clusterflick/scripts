const cheerio = require("cheerio");
const { getListingLinks } = require("../utils");

describe("getListingLinks", () => {
  it("returns each item's link, in order", () => {
    const $ = cheerio.load(`
      <div class="card"><h3><a href="/one">One</a></h3></div>
      <div class="card"><h3><a href="/two">Two</a></h3></div>`);
    expect(getListingLinks($, $(".card"), "h3 a")).toEqual(["/one", "/two"]);
  });

  it("takes an item's first link where it has several", () => {
    const $ = cheerio.load(`
      <div class="card"><a href="/one">Poster</a><a href="/one#book">Book</a></div>`);
    expect(getListingLinks($, $(".card"), "a")).toEqual(["/one"]);
  });

  // A seasonal or occasional venue with nothing on
  it("returns nothing for an empty listing", () => {
    const $ = cheerio.load(`<div class="upcoming"></div>`);
    expect(getListingLinks($, $(".upcoming .card"), "a")).toEqual([]);
  });

  // What Omniplex's retrieve met in November 2026: every card still there,
  // their links no longer matching
  it("throws on an item without its link", () => {
    const $ = cheerio.load(`
      <div class="card"><h3><a href="/one">One</a></h3></div>
      <div class="card"><h3><span>Two</span></h3></div>`);
    expect(() => getListingLinks($, $(".card"), "h3 a")).toThrow(
      'A listing item has no "h3 a" link — the page structure may have changed',
    );
  });

  it("throws on a link with no href", () => {
    const $ = cheerio.load(`<div class="card"><a>One</a></div>`);
    expect(() => getListingLinks($, $(".card"), "a")).toThrow(
      'A listing item has no "a" link',
    );
  });

  it("reads only the items it is given", () => {
    const $ = cheerio.load(`
      <div class="card" data-kind="cinema"><a href="/film">Film</a></div>
      <div class="card" data-kind="music"></div>`);
    const cinema = $(".card").filter((_, card) => {
      return $(card).attr("data-kind") === "cinema";
    });
    expect(getListingLinks($, cinema, "a")).toEqual(["/film"]);
  });
});

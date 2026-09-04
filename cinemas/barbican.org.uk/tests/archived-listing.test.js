const cheerio = require("cheerio");
const { isArchivedListing } = require("../utils");

const makeListing = (inner) =>
  cheerio.load(`<article class="listing--event">${inner}</article>`)(
    ".listing--event",
  );

const savedEventButton =
  '<button class="saved-event-button" data-saved-event-id="12345"></button>';

const cancelledLabel =
  '<div class="search-listing__label search-listing__label--archived">' +
  "<span>Cancelled</span></div>";

describe("isArchivedListing", () => {
  // A cancelled run has nothing left to save, so the Barbican drops the button
  // the event id is read from - the label is what tells us that is expected.
  it("is archived when the listing carries the archived label", () => {
    expect(isArchivedListing(makeListing(cancelledLabel))).toBe(true);
  });

  it("is not archived when the listing is on sale", () => {
    expect(isArchivedListing(makeListing(savedEventButton))).toBe(false);
  });

  // The plain label wrapper is used for more than archiving, so the modifier
  // rather than the wrapper has to be what marks a listing as archived.
  it("is not archived when the label carries no archived modifier", () => {
    expect(
      isArchivedListing(
        makeListing(
          '<div class="search-listing__label"><span>Sold out</span></div>' +
            savedEventButton,
        ),
      ),
    ).toBe(false);
  });
});

const { extractPlanGrid, isFallbackListing } = require("../utils");

const url = "https://feverup.com/en/london/things-to-do";

// The skeleton entry of the London catalogue's transfer state, trimmed to the
// fields read here. Both shapes are what Fever served for the same URL within
// a few seconds of each other.
const listing = (skeletonEntry) => ({
  "CityService.bySlugAndLanguage.londonen": {},
  "WhatPlanFilterService.getWPFSkeleton.LON967treatment": skeletonEntry,
});

const withGrid = listing({
  recommendation_tracker_id: "36f11c3b-28bb-4c00-898c-301371df0fd7",
  show_empty_error: false,
  skeleton: [
    {
      type: "plan_grid",
      content: { plans: [{ id: 1 }, { id: 2 }], has_multiple_pages: true },
    },
  ],
});

const fallback = listing({
  recommendation_tracker_id: "fallback_188fee17-2099-44e0-bde1-c59269884baa",
  show_empty_error: true,
  skeleton: [],
});

describe("isFallbackListing", () => {
  it("is false for a listing rendered with its grid", () => {
    expect(isFallbackListing(withGrid, url)).toBe(false);
  });

  it("is true for Fever's fallback listing", () => {
    expect(isFallbackListing(fallback, url)).toBe(true);
  });

  it("throws when the page has no listing at all", () => {
    expect(() => isFallbackListing({}, url)).toThrow(
      `Missing what plan filter skeleton in page: ${url}`,
    );
  });
});

describe("extractPlanGrid", () => {
  it("reads the grid and its tracker id", () => {
    expect(extractPlanGrid(withGrid, url)).toEqual({
      trackerId: "36f11c3b-28bb-4c00-898c-301371df0fd7",
      plans: [{ id: 1 }, { id: 2 }],
      hasMultiplePages: true,
    });
  });

  it("names the fallback when that is why the grid is missing", () => {
    expect(() => extractPlanGrid(fallback, url)).toThrow(
      `Missing plan grid in page: ${url} (Fever served its fallback listing)`,
    );
  });
});

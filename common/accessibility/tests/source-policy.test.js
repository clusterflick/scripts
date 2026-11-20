const { getCinemaAttributes } = require("../../../cinemas");
const { classifySource, checkSourceTier } = require("../source-policy");

const rio = getCinemaAttributes("riocinema.org.uk");
const everyman = getCinemaAttributes("everymancinema.com-barnet");
const picturehouse = getCinemaAttributes("picturehouses.com-central");

describe("classifySource", () => {
  it("trusts the venue's own site most, with or without www", () => {
    expect(classifySource("https://www.riocinema.org.uk/access", rio)).toEqual({
      tier: 1,
    });
  });

  it("counts a chain's help desk as the venue's own, for that chain only", () => {
    const guide =
      "https://everymanmedia.freshdesk.com/support/solutions/articles/35000282523-barnet-accessibility-guide";
    expect(classifySource(guide, everyman)).toEqual({ tier: 1 });
    expect(classifySource(guide, rio)).toEqual({ unknown: true });
  });

  it("puts AccessAble at tier 2", () => {
    expect(
      classifySource("https://www.accessable.co.uk/venues/rio-cinema", rio),
    ).toEqual({ tier: 2 });
  });

  it("splits Euan's Guide between its venue information and its reviews", () => {
    expect(
      classifySource("https://www.euansguide.com/venues/rio-cinema-1", rio),
    ).toEqual({ tier: 2 });
    expect(
      classifySource(
        "https://www.euansguide.com/venues/rio-cinema-1/reviews/great-1",
        rio,
      ),
    ).toEqual({ tier: 3 });
  });

  it("doesn't let an old mirror of the chain's site pass as the site", () => {
    expect(
      classifySource(
        "https://www1.picturehouses.com/cinema/picturehouse-central",
        picturehouse,
      ),
    ).toEqual({ excluded: true });
  });

  it("knows nothing about a host nobody has added", () => {
    expect(classifySource("https://example.org/rio", rio)).toEqual({
      unknown: true,
    });
  });
});

describe("checkSourceTier", () => {
  it("accepts a source at its tier", () => {
    expect(
      checkSourceTier("https://riocinema.org.uk/access", 1, rio),
    ).toBeNull();
  });

  it("accepts a source trusted less than it could be", () => {
    expect(
      checkSourceTier("https://www.euansguide.com/venues/rio-cinema-1", 3, rio),
    ).toBeNull();
  });

  it("refuses a source trusted more than it can be", () => {
    expect(
      checkSourceTier("https://www.accessable.co.uk/venues/rio-cinema", 1, rio),
    ).toBe("accessable.co.uk is tier 2 at most, not tier 1");
  });

  it("refuses an excluded or unknown source", () => {
    expect(checkSourceTier("https://www.tagvenue.com/rooms/rio", 2, rio)).toBe(
      "tagvenue.com is an excluded source",
    );
    expect(checkSourceTier("https://example.org/rio", 2, rio)).toMatch(
      /^example\.org isn't in the source policy/,
    );
  });
});

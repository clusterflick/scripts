const { getCinemaAttributes } = require("../../../cinemas");
const {
  validateRecord,
  validateAll,
  getPublicationBlockers,
  findMissingQuotes,
  VENUE_FIELDS,
} = require("../validate");

const rio = getCinemaAttributes("riocinema.org.uk");
const ACCESS = "https://riocinema.org.uk/access";
const ACCESSABLE = "https://www.accessable.co.uk/venues/rio-cinema";

const unknown = () => ({
  status: "unknown",
  note: null,
  sources: [],
  conflict: null,
  last_found: null,
});

const source = (overrides = {}) => ({
  url: ACCESS,
  tier: 1,
  source_last_updated: null,
  checked_on: "2026-11-20",
  quote: "Step-free access from the street",
  ...overrides,
});

const known = (status, overrides = {}) => ({
  ...unknown(),
  status,
  sources: [source()],
  ...overrides,
});

const screen = (overrides = {}) => ({
  name: "Screen 1",
  step_free: unknown(),
  wheelchair_spaces: { ...unknown(), count: null },
  space_position: { ...unknown(), value: "unknown" },
  transfer_seating: unknown(),
  hearing_assist: unknown(),
  notes: null,
  ...overrides,
});

const record = (overrides = {}) => ({
  id: rio.id,
  access_page_url: ACCESS,
  access_contact: null,
  coverage: "researched",
  verified: false,
  researched_on: "2026-11-20",
  notes: null,
  ...Object.fromEntries(VENUE_FIELDS.map((key) => [key, unknown()])),
  screens: [],
  ...overrides,
});

describe("validateRecord", () => {
  it("accepts a record that's all unknown", () => {
    expect(validateRecord(record(), rio)).toEqual([]);
  });

  it("accepts sourced facts", () => {
    expect(
      validateRecord(
        record({
          entrance_step_free: known("yes"),
          screens: [
            screen({
              wheelchair_spaces: {
                ...known("yes", {
                  sources: [source({ url: ACCESSABLE, tier: 2 })],
                }),
                count: 2,
              },
            }),
          ],
        }),
        rio,
      ),
    ).toEqual([]);
  });

  it("reports the shape before the rules", () => {
    expect(
      validateRecord(record({ lift: { status: "maybe" } }), rio),
    ).not.toHaveLength(0);
  });

  it("refuses a status no source gave", () => {
    expect(
      validateRecord(record({ lift: { ...unknown(), status: "yes" } }), rio),
    ).toEqual(['lift: status "yes" has no source']);
  });

  it("refuses a source trusted beyond its tier", () => {
    expect(
      validateRecord(
        record({
          lift: known("yes", { sources: [source({ url: ACCESSABLE })] }),
        }),
        rio,
      ),
    ).toEqual(["lift: accessable.co.uk is tier 2 at most, not tier 1"]);
  });

  it("keeps the last report found for fields we don't know", () => {
    const lastFound = {
      claim: "Has a lift",
      url: "https://www.euansguide.com/venues/rio-cinema-1/reviews/a-1",
      tier: 3,
      found_on: "2026-11-20",
    };
    expect(
      validateRecord(
        record({ lift: { ...unknown(), last_found: lastFound } }),
        rio,
      ),
    ).toEqual([]);
    expect(
      validateRecord(
        record({ lift: known("yes", { last_found: lastFound }) }),
        rio,
      ),
    ).toEqual(["lift: last_found is only for a field whose status is unknown"]);
  });

  it("allows a chain-wide policy for the venue but not for a screen", () => {
    const chainWide = [source({ chain_wide: true })];
    expect(
      validateRecord(
        record({ assistance_dogs: known("yes", { sources: chainWide }) }),
        rio,
      ),
    ).toEqual([]);
    expect(
      validateRecord(
        record({
          screens: [
            screen({ step_free: known("yes", { sources: chainWide }) }),
          ],
        }),
        rio,
      ),
    ).toEqual([
      `screens[0] (Screen 1).step_free: a screen fact needs a venue-specific source, not ${ACCESS}`,
    ]);
  });

  it("holds a count to its status", () => {
    const spaces = (status, count) =>
      record({
        screens: [
          screen({
            wheelchair_spaces:
              status === "unknown"
                ? { ...unknown(), count }
                : { ...known(status), count },
          }),
        ],
      });
    const prefix = "screens[0] (Screen 1).wheelchair_spaces";
    expect(validateRecord(spaces("yes", null), rio)).toEqual([]);
    expect(validateRecord(spaces("unknown", 2), rio)).toEqual([
      `${prefix}: count given for an unknown status`,
    ]);
    expect(validateRecord(spaces("no", 2), rio)).toEqual([
      `${prefix}: count 2 contradicts status "no"`,
    ]);
    expect(validateRecord(spaces("yes", 0), rio)).toEqual([
      `${prefix}: count 0 contradicts status "yes"`,
    ]);
  });

  it("refuses a position for an unknown status", () => {
    expect(
      validateRecord(
        record({
          screens: [
            screen({ space_position: { ...unknown(), value: "front" } }),
          ],
        }),
        rio,
      ),
    ).toEqual([
      'screens[0] (Screen 1).space_position: value "front" given for an unknown status',
    ]);
  });

  it("refuses two screens of the same name", () => {
    expect(
      validateRecord(record({ screens: [screen(), screen()] }), rio),
    ).toEqual(["screen names repeated: Screen 1"]);
  });

  it("refuses a record for a venue out of scope", () => {
    const host = { ...rio, programming: "host" };
    expect(validateRecord(record(), host)).toEqual([
      'venue programming is "host", which is out of scope',
    ]);
  });
});

describe("validateAll", () => {
  const other = getCinemaAttributes("actonecinema.co.uk");

  it("asks for a record for every venue in scope", () => {
    expect(validateAll([record()], [rio, other]).errors).toEqual([
      "actonecinema.co.uk: in scope but has no record",
    ]);
  });

  it("refuses a record for a venue that doesn't exist, or two for one", () => {
    expect(
      validateAll([record(), record(), record({ id: "nowhere" })], [rio])
        .errors,
    ).toEqual([
      "riocinema.org.uk: more than one record",
      "nowhere: no venue has this id",
    ]);
  });
});

describe("getPublicationBlockers", () => {
  it("holds back a record nobody has verified", () => {
    expect(getPublicationBlockers(record())).toEqual(["not verified"]);
  });

  it("holds back a verified record with a fact that has no quote", () => {
    expect(
      getPublicationBlockers(
        record({
          verified: true,
          lift: known("yes", { sources: [source({ quote: null })] }),
        }),
      ),
    ).toEqual([`lift: no quote from ${ACCESS}`]);
  });

  it("lets a verified, quoted record through, conflicts and all", () => {
    expect(
      getPublicationBlockers(
        record({
          verified: true,
          lift: known("yes", {
            sources: [source(), source({ url: ACCESSABLE, tier: 2 })],
            conflict: "AccessAble says platform lift",
          }),
        }),
      ),
    ).toEqual([]);
  });
});

describe("findMissingQuotes", () => {
  const withLift = record({ lift: known("yes") });

  it("passes a quote the page still has", () => {
    expect(
      findMissingQuotes(
        withLift,
        () => "There is Step-free access from the street.",
      ),
    ).toEqual([]);
  });

  it("reports a quote the page no longer has, or a page not fetched", () => {
    expect(findMissingQuotes(withLift, () => "Please call us.")).toEqual([
      `lift: quote not found on ${ACCESS}`,
    ]);
    expect(findMissingQuotes(withLift, () => undefined)).toEqual([
      `lift: ${ACCESS} wasn't fetched`,
    ]);
  });
});

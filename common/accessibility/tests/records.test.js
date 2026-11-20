const { getAllCinemaNames, getCinemaAttributes } = require("../../../cinemas");
const { readRecords, readSources } = require("../records");
const { validateAll, isInScope } = require("../validate");
const { checkSourceTier } = require("../source-policy");

// The committed data is checked like code: a pull request that changes a
// record, or adds a venue in scope without one, fails here.
describe("committed accessibility data", () => {
  const venues = getAllCinemaNames().map(getCinemaAttributes);

  it("validates, and covers every venue in scope", async () => {
    const records = await readRecords();
    expect(validateAll(records, venues).errors).toEqual([]);
    expect(records).toHaveLength(venues.filter(isInScope).length);
  });

  it("registers only sources the policy allows, for venues with records", async () => {
    const sources = await readSources();
    const records = new Set((await readRecords()).map(({ id }) => id));
    const problems = Object.entries(sources).flatMap(([id, entries]) => {
      if (!records.has(id)) return [`${id}: no record`];
      const attributes = getCinemaAttributes(id);
      return entries
        .map((entry) => checkSourceTier(entry.url, entry.tier, attributes))
        .filter(Boolean)
        .map((problem) => `${id}: ${problem}`);
    });
    expect(problems).toEqual([]);
  });
});

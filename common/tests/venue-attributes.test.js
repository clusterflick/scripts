const { getAllCinemaNames, getCinemaAttributes } = require("../../cinemas");
const { VENUE_TYPES, VENUE_PROGRAMMING } = require("../venue-types");

// Both fields are free-form strings in the module, so nothing but this test
// stops a fifth spelling of "Cafe" creeping in — or a missing `programming`,
// which would quietly drop the venue out of every website venue preset.
describe("venue attributes", () => {
  const names = getAllCinemaNames();

  it("has venues to check", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  describe.each(names)("%s", (name) => {
    const attributes = getCinemaAttributes(name);

    it("uses a known type", () => {
      expect(VENUE_TYPES).toContain(attributes.type);
    });

    it("uses a known programming value", () => {
      expect(VENUE_PROGRAMMING).toContain(attributes.programming);
    });
  });

  it("uses every type in the vocabulary", () => {
    const used = new Set(names.map((n) => getCinemaAttributes(n).type));
    // A type nothing uses is either a typo or a group the website will never
    // render, so the vocabulary and the venues have to agree in both directions.
    expect(VENUE_TYPES.filter((type) => !used.has(type))).toEqual([]);
  });
});

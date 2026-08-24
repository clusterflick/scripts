const { cleanCrewName } = require("../utils");

// Venues bill a director rather than just naming them, and the billing follows
// the name into the crew list where it matches nobody. These cover the shapes
// seen in venue and source listings, and - just as importantly - the names that
// must survive untouched.

describe("cleanCrewName", () => {
  it.each([
    // A role, with or without an adjective in front of it
    ["director Sean Baker", "Sean Baker"],
    ["Filmmaker James Ewen", "James Ewen"],
    ["renowned filmmaker Jonathan Demme", "Jonathan Demme"],
    ["award-winning director Ana Lily Amirpour", "Ana Lily Amirpour"],
    ["award winning filmmaker Ana Lily Amirpour", "Ana Lily Amirpour"],
    ["the film-maker Lynne Ramsay", "Lynne Ramsay"],
    // An accolade, which is always qualified by who gave it
    ["BAFTA nominees Iain Forsyth", "Iain Forsyth"],
    ["Oscar winner Chloé Zhao", "Chloé Zhao"],
    // A stray full stop left by the venue's own formatting
    ["Ava DuVernay .", "Ava DuVernay"],
  ])("strips the billing from %j", (name, expected) => {
    expect(cleanCrewName(name)).toBe(expected);
  });

  it.each([
    "Indhu Rubasingham",
    "Céline Sciamma",
    "RaMell Ross",
    "Payal Kapadia",
    "J.J. Abrams",
    // A surname that is also an accolade, which only the qualifier rules out
    "Michael Winner",
    // Prose rather than a name: stripping the role would leave "behind Bend It
    // Like Beckham", which reads enough like a name to be searched for
    "the acclaimed filmmaker behind Bend It Like Beckham",
    "the filmmaking duo of DEADHORSES",
  ])("leaves %j alone", (name) => {
    expect(cleanCrewName(name)).toBe(name);
  });
});

const { rankPeople } = require("../get-movie-data");

// Real /search/person payloads from TheMovieDB, trimmed to the fields the
// ranking reads.
const msRajuResults = [
  {
    id: 3942506,
    name: "M. S. Chalapathi Raju",
    known_for_department: "Crew",
    popularity: 0.2946,
  },
  {
    id: 237984,
    name: "M. S. Raju",
    known_for_department: "Production",
    popularity: 0.4239,
  },
  {
    id: 2020828,
    name: "S. M. Raju",
    known_for_department: "Writing",
    popularity: 0.3656,
  },
  {
    id: 3450635,
    name: "M. Srinivasa Raju",
    known_for_department: "Directing",
    popularity: 0.3052,
  },
];

const nolanResults = [
  {
    id: 525,
    name: "Christopher Nolan",
    known_for_department: "Directing",
    popularity: 12.6386,
  },
  {
    id: 6279344,
    name: "Christopher Nolan",
    known_for_department: "Directing",
    popularity: 0.2648,
  },
  {
    id: 4066940,
    name: "Christopher Nolan",
    known_for_department: "Acting",
    popularity: 0.3177,
  },
  {
    id: 6389343,
    name: "Christopher Nolan",
    known_for_department: "Production",
    popularity: 0.1454,
  },
  {
    id: 1097178,
    name: "Christopher Patrick Nolan",
    known_for_department: "Acting",
    popularity: 0.4856,
  },
  {
    id: 2526416,
    name: "Christopher Noland",
    known_for_department: "Directing",
    popularity: 0.4472,
  },
];

const idsOf = (people) => people.map(({ id }) => id);

describe("rankPeople", () => {
  it("ranks a producer-director above a namesake known for directing", () => {
    // M. S. Raju directed Agadha but is filed under "Production", so filtering
    // by department dropped him in favour of the unrelated M. Srinivasa Raju.
    expect(idsOf(rankPeople("M.S. Raju", msRajuResults))).toEqual([
      237984, // M. S. Raju - exact name
      3450635, // M. Srinivasa Raju - known for directing
      2020828, // S. M. Raju - more popular than the remaining result
      3942506, // M. S. Chalapathi Raju
    ]);
  });

  it("keeps exact namesakes ahead of a near-miss name", () => {
    // "Christopher Noland" is known for directing, but must not take a slot
    // ahead of the people actually called Christopher Nolan.
    expect(idsOf(rankPeople("Christopher Nolan", nolanResults))).toEqual([
      525, // exact name, directing, most popular
      6279344, // exact name, directing
      4066940, // exact name, acting
      6389343, // exact name, production
      2526416, // Christopher Noland - directing only
      1097178, // Christopher Patrick Nolan
    ]);
  });

  it("matches a name given in reverse order", () => {
    const people = [
      { id: 1, name: "Ratnam Mani", known_for_department: "Acting" },
      { id: 2, name: "Someone Else", known_for_department: "Directing" },
    ];
    expect(idsOf(rankPeople("Mani Ratnam", people))).toEqual([1, 2]);
  });

  it("falls back to popularity when nothing else separates the results", () => {
    const people = [
      { id: 1, name: "Someone Else", popularity: 1 },
      { id: 2, name: "Another Person", popularity: 9 },
    ];
    expect(idsOf(rankPeople("Not Listed", people))).toEqual([2, 1]);
  });

  it("does not mutate the results it was given", () => {
    const original = idsOf(msRajuResults);
    rankPeople("M.S. Raju", msRajuResults);
    expect(idsOf(msRajuResults)).toEqual(original);
  });
});

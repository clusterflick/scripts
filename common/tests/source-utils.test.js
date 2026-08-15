const {
  findMatchingCinema,
  findCinemasMatchingLocation,
  cinemaNameMatches,
} = require("../source-utils");

const ritzy = {
  id: "picturehouses.com-the-ritzy",
  name: "The Ritzy Picturehouse",
  alternativeNames: ["The Ritzy"],
  address: "Brixton Oval, Coldharbour Lane, London, SW2 1JG",
  geo: { lat: 51.4622, lon: -0.1148 },
};

// A second cinema a couple of doors down, to catch matches that only hold
// because there was nothing else nearby to confuse them
const neighbour = {
  id: "example.com-neighbour",
  name: "Brixton Storeys",
  address: "3 Brixton Station Road, London, SW9 8PB",
  geo: { lat: 51.4624, lon: -0.1147 },
};

const knownCinemas = [ritzy, neighbour];

describe("cinemaNameMatches", () => {
  test("matches the cinema's own name and its alternative names", () => {
    expect(cinemaNameMatches(ritzy, "the ritzy picturehouse")).toBe(true);
    expect(cinemaNameMatches(ritzy, "The Ritzy")).toBe(true);
  });

  test("rejects a name the cinema isn't known by", () => {
    expect(cinemaNameMatches(ritzy, "Brixton Storeys")).toBe(false);
  });
});

describe("findMatchingCinema", () => {
  test("matches on name and coordinates", () => {
    const match = findMatchingCinema(knownCinemas, "The Ritzy", {
      lat: 51.4623,
      lon: -0.1149,
    });

    expect(match).toBe(ritzy);
  });

  test("rejects a venue at the right place under an unknown name", () => {
    const match = findMatchingCinema(knownCinemas, "Ritzy Cafe Bar", {
      lat: 51.4623,
      lon: -0.1149,
    });

    expect(match).toBeUndefined();
  });

  test("rejects a known name too far from the cinema", () => {
    const match = findMatchingCinema(knownCinemas, "The Ritzy", {
      lat: 51.5074,
      lon: -0.1278,
    });

    expect(match).toBeUndefined();
  });

  test("matches on name alone when there is no location to check", () => {
    expect(findMatchingCinema(knownCinemas, "The Ritzy", null)).toBe(ritzy);
  });

  test("falls back to the address postcode when coordinates are wrong", () => {
    const match = findMatchingCinema(
      knownCinemas,
      "The Ritzy",
      { lat: 0, lon: 0 },
      { eventAddress: "Brixton Oval, London SW2 1JG" },
    );

    expect(match).toBe(ritzy);
  });

  test("accepts an outward code on its own as a postcode fallback", () => {
    const match = findMatchingCinema(knownCinemas, "The Ritzy", null, {
      eventAddress: "Coldharbour Lane, London SW2 5RW",
    });

    expect(match).toBe(ritzy);
  });

  test("keeps a known name whose coordinates are misconfigured when asked to", () => {
    const antipodes = { lat: -33.8688, lon: 151.2093 };

    expect(
      findMatchingCinema(knownCinemas, "The Ritzy", antipodes),
    ).toBeUndefined();
    expect(
      findMatchingCinema(knownCinemas, "The Ritzy", antipodes, {
        supportMisconfiguredCoordinates: true,
      }),
    ).toBe(ritzy);
  });
});

describe("findCinemasMatchingLocation", () => {
  test("returns cinemas at the location whatever the venue is called", () => {
    const matches = findCinemasMatchingLocation(knownCinemas, {
      lat: 51.4623,
      lon: -0.1149,
    });

    expect(matches.map(({ cinema }) => cinema.id)).toEqual([
      "picturehouses.com-the-ritzy",
      "example.com-neighbour",
    ]);
    expect(matches[0].locationMatch.type).toEqual("distance");
  });

  test("honours a tightened maxDistance", () => {
    const matches = findCinemasMatchingLocation(
      knownCinemas,
      { lat: 51.4622, lon: -0.1148 },
      { maxDistance: 0.005 },
    );

    expect(matches.map(({ cinema }) => cinema.id)).toEqual([
      "picturehouses.com-the-ritzy",
    ]);
  });

  test("distinguishes a full postcode from a postcode district", () => {
    const [exact] = findCinemasMatchingLocation(knownCinemas, null, {
      eventAddress: "Brixton Oval, London SW2 1JG",
    });
    const [area] = findCinemasMatchingLocation(knownCinemas, null, {
      eventAddress: "Coldharbour Lane, London SW2 5RW",
    });

    expect(exact.locationMatch).toEqual({
      type: "postcode",
      postcode: "SW2 1JG",
    });
    expect(area.locationMatch).toEqual({
      type: "postcode-area",
      postcode: "SW2 1JG",
    });
  });

  test("returns nothing when there is no location to check", () => {
    expect(findCinemasMatchingLocation(knownCinemas, null)).toEqual([]);
  });
});

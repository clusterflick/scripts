module.exports = {
  id: "themayfairhotel.co.uk",
  name: "May Fair Theatre",
  alternativeNames: ["The May Fair Hotel", "The May Fair"],
  // Eventbrite splits "The May Fair, A Radisson Collection Hotel" at the
  // comma, so the hotel arrives as "The May Fair" - which normalises to
  // "mayfair", the same as the district. Listings pinned to the district
  // geocode 77m away, inside the distance check, so only the raw name
  // keeps them out.
  excludedNames: ["Mayfair"],
  domain: "https://www.themayfairhotel.co.uk",
  socials: {
    letterboxd: null,
    twitter: "TheMayFairHotel",
    instagram: "themayfairhotel",
  },
  url: "https://www.themayfairhotel.co.uk/may-fair-theatre",
  address: "Stratton Street, London, W1J 8LT, UK",
  geo: { lat: 51.50823434301544, lon: -0.14424728172902768 },
  structure: "solo",
  type: "Screening Room",
  programming: "host",
};

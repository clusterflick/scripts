module.exports = {
  id: "electriccinema.co.uk-white-city",
  name: "Electric Cinema White City",
  // The cinema sits inside Soho House's White City House and shares its
  // address, so a platform taking the venue from whoever booked the room
  // lists it under the members' club rather than the cinema. findMatchingCinema
  // requires the name to match before it will look at the location, so without
  // this an exact address and coordinate pair still fails to match.
  alternativeNames: ["White City House", "Soho House White City"],
  domain: "https://www.electriccinema.co.uk",
  socials: {
    letterboxd: "electriccinemas",
    twitter: "electriccinema",
    instagram: "electriccinemas",
  },
  url: "https://www.electriccinema.co.uk/white-city/",
  address: "2 Television Centre, 101 Wood Lane, London, W12 7FR, UK",
  geo: { lat: 51.510808063329954, lon: -0.22545809809352405 },
  structure: "group",
  groupName: "Electric Cinema",
  type: "Cinema",
  programming: "cinema",
  cinemaId: "602",
};

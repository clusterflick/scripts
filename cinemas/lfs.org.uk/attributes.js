// The school's two cinemas are described on its site as being at its Shelton
// Street building, but every screening it publishes gives the Parker Street
// campus above The Garden Cinema. Nothing says which room is used, so this
// holds the address the tickets carry: it is where the listings send people,
// and what every source matches against. Sharing a building with The Garden
// Cinema is safe - a source event has to match the name as well as the place.
module.exports = {
  id: "lfs.org.uk",
  name: "London Film School",
  alternativeNames: ["LFS", "The London Film School"],
  domain: "https://lfs.org.uk",
  socials: {
    letterboxd: null,
    twitter: null,
    instagram: "thelondonfilmschool",
  },
  url: "https://lfs.org.uk",
  address: "39-41 Parker Street, London, WC2B 5PQ, UK",
  geo: { lat: 51.5162287, lon: -0.1213372 },
  structure: "solo",
  type: "University & College",
  programming: "host",
};

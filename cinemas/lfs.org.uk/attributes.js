// The school has two sites 400m apart. Its two cinemas are at Shelton Street,
// where most screenings - including those by groups hiring the rooms - are
// listed, so that is the address held here. The Parker Street campus, above
// The Garden Cinema, has no cinema but still turns up on some listings (PRIFF's
// programmes there don't name a room). `geoRadius` covers both sites; nothing
// else answers to the name, so the wider radius can't pull in a neighbour.
module.exports = {
  id: "lfs.org.uk",
  name: "London Film School",
  alternativeNames: ["LFS", "The London Film School"],
  domain: "https://lfs.org.uk",
  socials: {
    letterboxd: null,
    twitter: "lfsorguk",
    instagram: "thelondonfilmschool",
  },
  url: "https://lfs.org.uk",
  address: "24 Shelton Street, London, WC2H 9UB, UK",
  geo: { lat: 51.51373576262482, lon: -0.1254816305618999 },
  geoRadius: 0.5,
  structure: "solo",
  type: "University & College",
  programming: "host",
};

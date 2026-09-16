module.exports = {
  id: "instagram.com-canalfilmclub",
  name: "Canal Film Club",
  alternativeNames: [
    "East London Canal (Location released to ticket holders 48hrs before each event)",
    "East London Canal",
  ],
  domain: "https://www.instagram.com/canalfilmclub",
  socials: {
    letterboxd: null,
    twitter: null,
    instagram: "canalfilmclub",
  },
  url: "https://www.instagram.com/canalfilmclub/",
  address: "East London Canal, Hackney, London, E5 9RH, UK",
  geo: { lat: 51.56312474391641, lon: -0.043491730782087026 },
  // The club has no fixed home - its screenings are pop-ups along the East
  // London canals, billed as "TFL Zones 2-3" with the spot released to ticket
  // holders 48 hours before. The point above is the Lea; OutSavvy has published
  // it 2.3km away on the Regent's Canal, which is the same venue and not a
  // different one. 3km covers the stretch it works without reaching a
  // neighbouring venue that shares any of its names.
  geoRadius: 3,
  structure: "solo",
  type: "Community Cinema",
  programming: "host",
};

module.exports = {
  id: "ogniskopolskie.org.uk",
  name: "Ognisko Polskie",
  alternativeNames: [
    "Ognisko Polskie - Polish Hearth",
    "Polish Hearth Club",
    "The Polish Hearth",
    "Polish Hearth",
  ],
  domain: "https://www.ogniskopolskie.org.uk",
  socials: {
    letterboxd: null,
    twitter: "ognisko_polskie",
    instagram: "ognisko_polskie",
  },
  url: "https://www.ogniskopolskie.org.uk/shop/upcoming-events/2",
  address: "55 Princes Gate, London, SW7 2PN, UK",
  geo: { lat: 51.49915461167274, lon: -0.17404104775800866 },
  structure: "solo",
  type: "Cultural Centre",
  programming: "host",
  // The site is a Square Online store. Its own pages are client-rendered, but
  // the store API behind them is public and returns each listing as a
  // structured product - including, for an event, its date and start time.
  // Both ids are written into every page's HTML, so they can be recovered if
  // this venue ever migrates.
  squareUserId: "143854010",
  squareSiteId: "331421882896289726",
};

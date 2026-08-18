module.exports = {
  id: "bbk.ac.uk-central",
  name: "Birkbeck Central",
  alternativeNames: [
    "Birkbeck",
    "Malet Street",
    "Birkbeck, University of London",
    "Birkbeck Library",
    " Birkbeck Clore Management Centre",
    "Birkbeck Main Building",
  ],
  // Normalising drops the word "cinema", so "Birkbeck Cinema" would otherwise
  // reduce to the "Birkbeck" alias above and match here too. It names
  // bbk.ac.uk-cinema, 300m away - too close for the distance check to separate.
  excludedNames: ["Birkbeck Cinema"],
  domain: "https://www.bbk.ac.uk",
  socials: {
    letterboxd: null,
    twitter: "BirkbeckUoL",
    instagram: "birkbeckuol",
  },
  url: "https://www.bbk.ac.uk",
  address: "University of London, Malet Street, London, WC1E 7HX, UK",
  geo: { lat: 51.52199660997907, lon: -0.13026175425819903 },
  structure: "group",
  groupName: "Birkbeck",
  type: "University",
};

module.exports = {
  id: "bbk.ac.uk-cinema",
  name: "Birkbeck Cinema",
  alternativeNames: [
    "Gordon Square",
    "Birkbeck 43 Gordon Square",
    "Birkbeck Institute for the Moving Image",
  ],
  // A bare "Birkbeck" belongs to bbk.ac.uk-central: the two sit 300m apart, so
  // the distance check can't separate them, and this venue's own name reduces
  // to "birkbeck" once normalised. "Birkbeck Cinema" still matches here.
  excludedNames: ["Birkbeck"],
  domain: "https://www.bbk.ac.uk",
  socials: {
    letterboxd: null,
    twitter: "BirkbeckUoL",
    instagram: "birkbeckuol",
  },
  url: "https://www.bbk.ac.uk/events?tag=30",
  address: "University of London, 43 Gordon Square, London, WC1H 0PY, UK",
  geo: { lat: 51.52466462157211, lon: -0.13033861877673095 },
  structure: "group",
  groupName: "Birkbeck",
  type: "University & College",
  programming: "venue",
};

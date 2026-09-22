module.exports = {
  id: "luma.com",
  name: "Luma",
  domain: "https://luma.com",
  socials: {
    letterboxd: null,
    twitter: "luma_hq",
    instagram: "luma.hq",
  },
  // The canonical listing for the source. The retrieve reads the JSON API
  // behind this page rather than the page itself - see `retrieve.js` for why
  // the coordinates have to be passed explicitly.
  url: "https://luma.com/arts",
};

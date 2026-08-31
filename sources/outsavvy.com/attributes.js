module.exports = {
  id: "outsavvy.com",
  name: "OutSavvy",
  domain: "https://outsavvy.com",
  socials: {
    letterboxd: null,
    twitter: "outsavvy",
    instagram: "outsavvy",
  },
  // The canonical listing for the source. The retrieve sweeps several
  // hashtags rather than this one URL - a "?loc=" is ignored by OutSavvy
  // (the "Film in <place>" heading is geolocated from the caller's IP and
  // does not filter the results), so there is no location to pin here.
  url: "https://www.outsavvy.com/hashtag/film",
};

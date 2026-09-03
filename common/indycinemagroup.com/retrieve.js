const { listingRequest } = require("./utils");

const query = `
query ($limit: Int, $orderBy: String, $type: String) {
  movies(
    limit: $limit
    orderBy: $orderBy
    type: $type
  ) {
    data {
      id
      name
      showingStatus
      urlSlug
      posterImage
      bannerImage
      synopsis
      starring
      directedBy
      producedBy
      searchTerms
      duration
      genre
      allGenres
      rating
      trailerYoutubeId
      trailerVideo
      releaseDate
      dateOfFirstShowing
      tmdbPopularityScore
      tmdbId
      dcmEdiMovieId
      dcmEdiMovieName
      siteId
      titleClassId
      displayMetaData

      showings {
        id
        time
        ticketsSold
        screenId
        seatsRemaining
        displayMetaData
      }
    }
  }
}
`;

async function retrieve(attributes) {
  const response = await fetch(...listingRequest(attributes, query));

  return await response.json();
}

module.exports = retrieve;

const variables = {
  limit: 1000,
  orderBy: "magic",
  type: "all-published",
};

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

async function retrieve({ siteId, domain }) {
  const response = await fetch(`${domain}/graphql`, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json",
      "client-type": "consumer",
      cookie: `site_id=${siteId}`,
    },
  });

  return await response.json();
}

module.exports = retrieve;

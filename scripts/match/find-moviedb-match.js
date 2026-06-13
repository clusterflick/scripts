async function findMovieDbMatch(movieInfo) {
  if (!movieInfo || !movieInfo.vote_count) return undefined;

  return {
    id: `${movieInfo.id}`,
    url: `https://www.themoviedb.org/movie/${movieInfo.id}`,
    reviews: movieInfo.vote_count,
    rating: movieInfo.vote_average,
  };
}

module.exports = findMovieDbMatch;

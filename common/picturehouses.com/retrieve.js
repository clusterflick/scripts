const { fetchText } = require("../../common/utils");

async function retrieve({ domain, cinemaId }) {
  const variables = {
    start_date: "show_all_dates",
    cinema_id: cinemaId,
  };

  const moviesResponse = await fetch(`${domain}/api/get-movies-ajax`, {
    method: "POST",
    body: new URLSearchParams(variables).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });
  const movieListPage = await moviesResponse.json();

  const moviesIdsAtCinema = movieListPage.movies.reduce((list, movie) => {
    const showings = movie.show_times.filter(
      (showing) => showing.CinemaId === cinemaId,
    );
    return showings.length === 0 ? list : list.concat(movie.ScheduledFilmId);
  }, []);

  const moviePages = {};
  for (movieId of moviesIdsAtCinema) {
    const url = `${domain}/movie-details/${cinemaId}/${movieId}/-`;
    moviePages[movieId] = await fetchText(url);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;

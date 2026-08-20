const { buildMovieData } = require("../build-movie-data");

const context = (overrides = {}) => ({
  slugify: (value) => value,
  siteData: { people: {}, genres: {} },
  ...overrides,
});

const movieInfo = (overrides = {}) => ({
  id: 194,
  title: "Amélie",
  original_title: "Le Fabuleux Destin d'Amélie Poulain",
  original_language: "fr",
  credits: {},
  genres: [],
  ...overrides,
});

describe("buildMovieData", () => {
  it("surfaces the original title for a foreign-language film", async () => {
    const movie = await buildMovieData(movieInfo(), context());
    expect(movie.originalTitle).toBe("Le Fabuleux Destin d'Amélie Poulain");
  });

  it("omits the original title when the original language is English", async () => {
    const movie = await buildMovieData(
      movieInfo({
        title: "Dune: Part One",
        original_title: "Dune",
        original_language: "en",
      }),
      context(),
    );
    expect(movie.originalTitle).toBeUndefined();
  });

  it("omits the original title when it matches the display title", async () => {
    const movie = await buildMovieData(
      movieInfo({
        title: "Amélie",
        original_title: "Amélie",
      }),
      context(),
    );
    expect(movie.originalTitle).toBeUndefined();
  });

  it("omits the original title when the non-slugifiable title already fell back to it", async () => {
    // slugify rejects the non-roman display title, so build-movie-data falls
    // back to original_title as the site's `title` - leaving nothing left to
    // surface as a separate "original title".
    const movie = await buildMovieData(
      movieInfo({
        title: "映画",
        original_title: "映画",
        original_language: "ja",
      }),
      context({ slugify: () => "" }),
    );
    expect(movie.title).toBe("映画");
    expect(movie.originalTitle).toBeUndefined();
  });
});

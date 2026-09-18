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
    expect(movie.originalLanguage).toBe("fr");
  });

  it("omits the original title and language when the original language is English", async () => {
    const movie = await buildMovieData(
      movieInfo({
        title: "Dune: Part One",
        original_title: "Dune",
        original_language: "en",
      }),
      context(),
    );
    expect(movie.originalTitle).toBeUndefined();
    expect(movie.originalLanguage).toBeUndefined();
  });

  it("omits the original title but keeps the original language when it matches the display title", async () => {
    // e.g. "Roma" - the original-language title happens to read the same in
    // English, but the film is still worth flagging as non-English.
    const movie = await buildMovieData(
      movieInfo({
        title: "Amélie",
        original_title: "Amélie",
      }),
      context(),
    );
    expect(movie.originalTitle).toBeUndefined();
    expect(movie.originalLanguage).toBe("fr");
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

describe("people popularity", () => {
  const credits = (popularity) => ({
    crew: [{ id: 1, name: "Jean-Pierre Jeunet", job: "Director", popularity }],
    cast: [{ id: 2, name: "Audrey Tautou", order: 0, popularity: 9.5 }],
  });

  it("carries TheMovieDB's popularity through to the people record", async () => {
    const ctx = context();
    await buildMovieData(movieInfo({ credits: credits(12.5) }), ctx);
    expect(ctx.siteData.people["1"]).toEqual({
      id: "1",
      name: "Jean-Pierre Jeunet",
      popularity: 12.5,
    });
    expect(ctx.siteData.people["2"].popularity).toBe(9.5);
  });

  it("leaves popularity absent rather than defaulting a missing score to zero", async () => {
    const ctx = context();
    await buildMovieData(movieInfo({ credits: credits(undefined) }), ctx);
    expect(ctx.siteData.people["1"].popularity).toBeUndefined();
    expect("popularity" in ctx.siteData.people["1"]).toBe(true);
  });

  // Each film's TheMovieDB record was cached at a different moment, so the same
  // person arrives with a different snapshot per film. Taking the maximum makes
  // the published value independent of the order the films were read in.
  it("keeps the highest popularity when a person is credited on several films", async () => {
    const ctx = context();
    await buildMovieData(movieInfo({ id: 1, credits: credits(12.5) }), ctx);
    await buildMovieData(movieInfo({ id: 2, credits: credits(3.1) }), ctx);
    expect(ctx.siteData.people["1"].popularity).toBe(12.5);
  });

  it("does not depend on the order the films are read in", async () => {
    const ascending = context();
    await buildMovieData(
      movieInfo({ id: 1, credits: credits(3.1) }),
      ascending,
    );
    await buildMovieData(
      movieInfo({ id: 2, credits: credits(12.5) }),
      ascending,
    );
    expect(ascending.siteData.people["1"].popularity).toBe(12.5);
  });

  it("takes a later score for a person first seen without one", async () => {
    const ctx = context();
    await buildMovieData(
      movieInfo({ id: 1, credits: credits(undefined) }),
      ctx,
    );
    await buildMovieData(movieInfo({ id: 2, credits: credits(4.2) }), ctx);
    expect(ctx.siteData.people["1"].popularity).toBe(4.2);
  });
});

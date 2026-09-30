const transform = require("../transform");

const attributes = {
  id: "picturehouses.com-central",
  name: "Picturehouse Central",
  domain: "https://www.picturehouses.com",
  cinemaId: "022",
};

const FILM_ID = "HO00018757";

// A trimmed listing with the fields transform reads.
const showing = (SessionId, SoldoutStatus) => ({
  CinemaId: attributes.cinemaId,
  ScheduledFilmId: FILM_ID,
  Showtime: "2026-10-15T18:30:00",
  SessionId,
  SessionAttributesNames: ["2D"],
  ScreenName: "KIA Screen 2",
  SoldoutStatus,
  attributes: [],
});

const getSoldOut = async (...showings) => {
  const movies = await transform(
    attributes,
    {
      movieListPage: {
        movies: [
          {
            Title: "Naza Q+A: Live Broadcast",
            ScheduledFilmId: FILM_ID,
            RunTime: "120",
            Rating: "15",
            TrailerUrl: "",
            show_times: showings,
          },
        ],
      },
      moviePages: { [FILM_ID]: "<div class='synopsisDiv'></div>" },
    },
    {},
  );

  expect(movies).toHaveLength(1);
  return movies[0].performances.map(({ status }) => status.soldOut);
};

describe("Picturehouse transform sold out status", () => {
  it("reads the string statuses given to the requested cinema", async () => {
    await expect(
      getSoldOut(
        showing("122686", "0"),
        showing("122687", "1"),
        showing("122688", "2"),
      ),
    ).resolves.toEqual([false, false, true]);
  });

  it("reads the numeric statuses given to other cinemas", async () => {
    await expect(
      getSoldOut(
        showing("122686", 0),
        showing("122687", 1),
        showing("122688", 2),
      ),
    ).resolves.toEqual([false, false, true]);
  });

  it("fails on a status it does not recognise", async () => {
    await expect(getSoldOut(showing("122686", "3"))).rejects.toThrow(
      'Unexpected SoldoutStatus "3" for session 122686',
    );
  });
});

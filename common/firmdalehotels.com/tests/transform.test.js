const transform = require("../transform");

const attributes = {
  id: "firmdalehotels.com-soho",
  name: "Firmdale The Soho Hotel",
  domain: "https://www.firmdalehotels.com",
  url: "https://www.firmdalehotels.com/whats-on/firmdale-film-club",
};

const BOOKING_URL =
  "https://www.sevenrooms.com/reservations/refuelbarandrestaurant?default_date=2026-11-01&default_time=3:30PM";

// A trimmed section with the fields transform reads. Each showing is one list
// item; `anchors` are the links the CMS rendered inside it.
const movieListPage = (...anchors) => `
  <section class="section">
    <div class="text-block">
      <h2 class="heading--h3">Bad Apples</h2>
      <p>An exhausted primary school teacher snaps.</p>
      <p>Stars Saoirse Ronan<br><em>(Certification 15)</em></p>
      <ul>
        <li>${anchors
          .map((text) => `<a href="${BOOKING_URL}">${text}</a>`)
          .join("")}</li>
      </ul>
    </div>
  </section>
`;

const getPerformances = async (...anchors) => {
  const movies = await transform(
    attributes,
    {
      movieListPage: movieListPage(...anchors),
    },
    {},
  );

  expect(movies).toHaveLength(1);
  return movies[0].performances;
};

describe("Firmdale Hotels transform", () => {
  it("reads a showing the CMS rendered as one link", async () => {
    const performances = await getPerformances(
      "THE SOHO HOTEL - SUNDAY 1ST NOVEMBER, 3:30PM",
    );

    expect(performances).toHaveLength(1);
    expect(new Date(performances[0].time).toISOString()).toBe(
      "2026-11-01T15:30:00.000Z",
    );
    expect(performances[0].bookingUrl).toBe(BOOKING_URL);
  });

  // The CMS sometimes splits one showing's link into several adjacent anchors
  // sharing the same href, cutting the text mid-string. Read as separate
  // links, the first half ("... 3:") has no parsable time and the second
  // ("30PM") names no venue.
  it("reads a showing the CMS split across several links", async () => {
    const performances = await getPerformances(
      "THE SOHO HOTEL - SUNDAY 1ST NOVEMBER, 3:",
      "30PM",
    );

    expect(performances).toHaveLength(1);
    expect(new Date(performances[0].time).toISOString()).toBe(
      "2026-11-01T15:30:00.000Z",
    );
    expect(performances[0].bookingUrl).toBe(BOOKING_URL);
  });

  it("skips a showing at another Firmdale hotel", async () => {
    const movies = await transform(
      attributes,
      {
        movieListPage: movieListPage(
          "COVENT GARDEN HOTEL - SATURDAY 31ST OCTOBER, 8PM",
        ),
      },
      {},
    );

    expect(movies).toHaveLength(0);
  });
});

const { removeAlreadyListedPerformances } = require("../utils");

describe("removeAlreadyListedPerformances", () => {
  const venueMovie = (bookingUrl) => ({
    title: "Point Break",
    performances: [{ time: 1786644000000, bookingUrl }],
  });
  const sourcedEvent = (bookingUrl) => ({
    title: "Point Break",
    performances: [{ time: 1786644000000, bookingUrl }],
  });

  test("removes a sourced performance the venue already books through", () => {
    const url = "https://www.thecliq.app/event/cinebug-summer-social";
    expect(
      removeAlreadyListedPerformances([venueMovie(url)], [sourcedEvent(url)]),
    ).toEqual([{ title: "Point Break", performances: [] }]);
  });

  test("keeps a sourced performance booked elsewhere", () => {
    const sourced = sourcedEvent("https://www.thecliq.app/event/other-night");
    expect(
      removeAlreadyListedPerformances(
        [venueMovie("https://www.thecliq.app/event/cinebug-summer-social")],
        [sourced],
      ),
    ).toEqual([sourced]);
  });

  test("keeps a sourced performance when neither side has a booking URL", () => {
    const sourced = sourcedEvent("");
    expect(
      removeAlreadyListedPerformances([venueMovie("")], [sourced]),
    ).toEqual([sourced]);
  });
});

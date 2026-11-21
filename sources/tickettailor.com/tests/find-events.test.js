const { readJSON } = require("../../../common/utils");
const findEvents = require("../find-events");

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

// The Mildmay Pantomime as Ticket Tailor listed it in November 2026: one
// listing per date, two with a single time and two with several, and a date
// picker holding every date.
const listing = (date, dateText) => `
  <div class="events-listing__item">
    <h3 class="event__title">
      <a href="/events/mildmayclubandinstituteltd/2469748?date=${date}">
        The Mildmay Pantomime 2026
      </a>
    </h3>
    <div class="event-meta__date">${dateText}</div>
    <div class="event-meta__location">Main Hall, The Mildmay Club, N169PR</div>
  </div>`;

const escape = (text) =>
  text.replace(/[-/:<> ]/g, (c) => `\\x${c.charCodeAt(0).toString(16)}`);

const pickerDate = (date, times) => `
  var thisDate = { available: true, sold_out: false };
  var times = [];
  ${times
    .map(
      ([id, start, end]) => `
  var time = { id: "${id}", url: "${escape(`/checkout/new-session/id/${id}`)}", date_string: "${escape(` <var>${start}</var> - <var>${end}</var> GMT`)}" }
  times.push(time);`,
    )
    .join("")}
  selectableDates["${escape(date)}"] = thisDate;`;

const datePage = `<script>
  var selectableDates = {};
  ${pickerDate("2026-12-10", [["1", "7:00 PM", "10:30 PM"]])}
  ${pickerDate("2026-12-11", [["2", "7:00 PM", "10:00 PM"]])}
  ${pickerDate("2026-12-12", [
    ["3", "1:30 PM", "5:00 PM"],
    ["4", "6:00 PM", "9:00 PM"],
  ])}
  ${pickerDate("2026-12-13", [
    ["5", "1:30 PM", "5:00 PM"],
    ["6", "6:00 PM", "9:00 PM"],
  ])}
</script>`;

const mildmayClub = {
  name: "The Mildmay Club",
  alternativeNames: [],
  address: "34 Newington Green Road, London, N16 9PR, UK",
};

describe("findEvents", () => {
  it("reads an event with any multi-time listing once, from its date picker", async () => {
    readJSON.mockResolvedValue({
      clubPages: {
        mildmayclubandinstituteltd: [
          listing("2026-12-10", "Thu 10 Dec 2026 7:00 PM - 10:30 PM GMT"),
          listing("2026-12-11", "Fri 11 Dec 2026 7:00 PM - 10:00 PM GMT"),
          listing("2026-12-12", "Sat 12 Dec 2026 · Multiple times"),
          listing("2026-12-13", "Sun 13 Dec 2026 · Multiple times"),
        ].join(""),
      },
      eventPages: {
        2469748: `<div class="detail-content"></div>`,
      },
      datePages: { 2469748: datePage },
    });

    const events = await findEvents(mildmayClub);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("The Mildmay Pantomime 2026");
    expect(
      events[0].performances.map(({ time }) => new Date(time).toISOString()),
    ).toEqual([
      "2026-12-10T19:00:00.000Z",
      "2026-12-11T19:00:00.000Z",
      "2026-12-12T13:30:00.000Z",
      "2026-12-12T18:00:00.000Z",
      "2026-12-13T13:30:00.000Z",
      "2026-12-13T18:00:00.000Z",
    ]);
  });
});

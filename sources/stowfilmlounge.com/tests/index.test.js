/** @jest-environment setup-polly-jest/jest-environment-node */
const { setupPolly, schemaValidate } = require("../../../common/test-utils");
const {
  readJSON,
  removeMatchingHints,
  addTestCategory,
} = require("../../../common/utils");
const { attributes, retrieve, findEvents } = require("..");

const isRecording = false;

jest.mock("../../../common/utils", () => ({
  ...jest.requireActual("../../../common/utils"),
  readJSON: jest.fn(),
}));

const langthorneParkCinema = {
  name: "Langthorne Park",
};

const stoneydownParkCinema = {
  name: "Stoneydown Park",
};

const stMarysChurchCinema = {
  name: "St Mary's Church Walthamstow",
  alternativeNames: ["St Mary's Church"],
};

describe(`${attributes.name}`, () => {
  setupPolly(isRecording, __dirname);
  jest.useFakeTimers().setSystemTime(new Date("2026-08-22"));

  it(
    "retrieve and find events",
    async () => {
      const { movieListPage } = await retrieve();

      // Make sure the input looks roughly correct
      expect(movieListPage).toBeTruthy();
      expect(movieListPage).toContain("STOW FILM LOUNGE");

      readJSON.mockImplementation(() => ({ movieListPage }));

      const langthorneParkOutput = await findEvents(langthorneParkCinema);

      expect(
        langthorneParkOutput.every((movie) =>
          Object.prototype.hasOwnProperty.call(movie, "matchingHints"),
        ),
      ).toBe(true);

      const langthorneParkData = JSON.parse(
        JSON.stringify(langthorneParkOutput),
      )
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(langthorneParkData).toHaveLength(2);
      expect(langthorneParkData).toMatchSnapshot("Langthorne Park events");

      // Stoneydown Park's screening is free, with the venue's own "just turn
      // up" label in place of a ticket link
      const stoneydownParkOutput = await findEvents(stoneydownParkCinema);
      const stoneydownParkData = JSON.parse(
        JSON.stringify(stoneydownParkOutput),
      )
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(stoneydownParkData).toHaveLength(1);
      expect(stoneydownParkData[0].performances[0].notes).toBe(
        "FREE EVENT - JUST TURN UP",
      );
      expect(stoneydownParkData[0].performances[0].bookingUrl).toBe(
        attributes.url,
      );
      expect(stoneydownParkData).toMatchSnapshot("Stoneydown Park events");

      const output = await findEvents(stMarysChurchCinema);
      const data = JSON.parse(JSON.stringify(output))
        .map(removeMatchingHints)
        .map(addTestCategory);

      // Make sure the data looks roughly correct
      expect(schemaValidate(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data).toMatchSnapshot("St Mary's Church events");
    },
    isRecording ? 600_000 : undefined,
  );

  // Markup trimmed from the live page, where a screening gave only its doors
  // time: "Doors open 19:00 & Close 22:00", with no "Film" time anywhere
  it("uses the doors time when no film time is published", async () => {
    const movieListPage = `
      <section>
        <div class="sqs-html-content">
          <h3>STOW FILM LOUNGE @ WALTHAMSTOW TRADES HALL</h3>
          <h4>TUESDAY 10th NOVEMBER</h4>
        </div>
        <figure>
          <figcaption>
            <p>A HARD DAY’S NIGHT (Richard Lester, 1964, Cert PG, 87mins)</p>
            <p>Doors open 19:00 &amp; Close 22:00</p>
          </figcaption>
        </figure>
        <div class="sqs-block-button-container">
          <a href="https://www.eventbrite.co.uk/e/a-hard-days-night-screening-samira-ahmed-in-conversation-tickets-2002399477741">BOOK NOW</a>
        </div>
        <div class="sqs-html-content">
          <p>Doors: Open 19:00, Close 22:00</p>
        </div>
      </section>
    `;

    readJSON.mockImplementation(() => ({ movieListPage }));

    const output = await findEvents({ name: "Walthamstow Trades Hall" });

    expect(output).toHaveLength(1);
    expect(output[0].title).toBe("A HARD DAY’S NIGHT");
    expect(output[0].performances).toHaveLength(1);
    expect(new Date(output[0].performances[0].time)).toEqual(
      new Date("2026-11-10T19:00:00Z"),
    );
    expect(output[0].performances[0].notes).toBe(
      "Doors open 19:00 & Close 22:00",
    );
  });

  it("throws when neither a film nor a doors time is published", async () => {
    const movieListPage = `
      <section>
        <div class="sqs-html-content">
          <h3>STOW FILM LOUNGE @ WALTHAMSTOW TRADES HALL</h3>
          <h4>TUESDAY 10th NOVEMBER</h4>
        </div>
        <figure>
          <figcaption>
            <p>A HARD DAY’S NIGHT (Richard Lester, 1964, Cert PG, 87mins)</p>
            <p>Close 22:00</p>
          </figcaption>
        </figure>
        <div class="sqs-block-button-container">
          <a href="https://www.eventbrite.co.uk/e/a-hard-days-night-screening-samira-ahmed-in-conversation-tickets-2002399477741">BOOK NOW</a>
        </div>
      </section>
    `;

    readJSON.mockImplementation(() => ({ movieListPage }));

    await expect(
      findEvents({ name: "Walthamstow Trades Hall" }),
    ).rejects.toThrow("Could not extract film or doors time");
  });

  it("returns no events for unrelated cinema", async () => {
    const { movieListPage } = await retrieve();

    readJSON.mockImplementation(() => ({ movieListPage }));

    const unrelatedCinema = {
      name: "Some Other Cinema",
      alternativeNames: [],
    };
    const output = await findEvents(unrelatedCinema);

    expect(output).toHaveLength(0);
  });
});

const transform = require("../transform");

const attributes = {
  id: "thecastlecinema.com",
  name: "The Castle Cinema",
  domain: "https://thecastlecinema.com",
};

const PATH = "/programme/112731/rachel-getting-married/";
const URL = `${attributes.domain}${PATH}`;

// A trimmed listing tile with the fields transform reads.
const movieListPage = `
  <div id="slim-tiles">
    <div class="programme-tile" data-prog-id="112731">
      <div class="tile-details">
        <a href="${PATH}"><span class="tile-name">Rachel Getting Married</span></a>
        <span class="tile-subname">Jonathan Demme, 2008</span>
      </div>
      <div class="film-times">
        <a href="${PATH}book/" data-start-time="2026-08-14T20:30:00+01:00" data-filters="">
          <span class="screen">Screen 1</span>
        </a>
      </div>
    </div>
  </div>
`;

// The synopsis as the site renders it: paragraphs of blurb, with any club
// credit on a line of its own at the end.
const moviePage = (...paragraphs) => `
  <div class="film-details">
    <span class="film-duration">113 mins</span>
    <div class="meta">
      <div class="meta-line"><span class="film-director">Jonathan Demme</span></div>
      <div class="meta-line"><span class="film-cast">Anne Hathaway</span></div>
    </div>
    <span class="film-synopsis">
      ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n")}
    </span>
  </div>
`;

const BLURB =
  "An Oscar-nominated Anne Hathaway gives arguably her best performance as Kym.";

const getNotes = async (...paragraphs) => {
  const movies = await transform(
    attributes,
    { movieListPage, moviePages: { [URL]: moviePage(...paragraphs) } },
    {},
  );

  expect(movies).toHaveLength(1);
  expect(movies[0].performances).toHaveLength(1);
  return movies[0].performances[0].notes;
};

describe("The Castle Cinema transform", () => {
  it("notes the film club presenting a screening", async () => {
    const notes = await getNotes(
      BLURB,
      "<i>Presented by Distorted Frame, a film club which presents screenings of uniquely digital films.</i>",
    );

    expect(notes).toEqual("Presented by Distorted Frame");
  });

  it("ignores a credit buried mid-sentence in the blurb", async () => {
    const notes = await getNotes(
      "The restoration was presented by the studio as a lost classic.",
    );

    expect(notes).toEqual("");
  });
});

const transform = require("../transform");

// The language row in the film page's details is the only signal that a
// showing is subtitled when the subtitled tag is missing from its performances.
// The page gives its details either as a figure table or as paragraphs.
const layouts = {
  table: (language) => `
    <html><body><div class="te"><figure><table>
      <tr><td>Language:</td><td>${language}</td></tr>
    </table></figure></div></body></html>
  `,
  paragraphs: (language) => `
    <html><body><div class="te">
      <p>At the height of the Cold War...</p>
      <p>Language: <strong>${language}</strong></p>
    </div></body></html>
  `,
};

const runTransform = (layout, language) => {
  const movie = {
    id: "5517",
    title: "Fatherland",
    url: "https://riversidestudios.co.uk/whats-on/uGh-fatherland/",
    duration: "82 minutes",
    age_rating_class: "12a",
    performances: {
      1792767600: [{ tag_ids: ["101", "81001"], timestamp: "1792767600" }],
    },
  };
  return transform(
    {
      movieListPage: [movie],
      moviePages: { [movie.url]: layouts[layout](language) },
    },
    {},
  );
};

describe.each(Object.keys(layouts))(
  "subtitles from the %s language row",
  (layout) => {
    it.each([
      "German with subtitles",
      "German with English subtitles",
      // Published misspelt on the venue's Fatherland page
      "German with subtiles",
    ])("marks %p as subtitled", async (language) => {
      const [movie] = await runTransform(layout, language);

      expect(movie.performances[0].accessibility).toEqual({ subtitled: true });
    });

    it("does not mark a language without subtitles", async () => {
      const [movie] = await runTransform(layout, "German");

      expect(movie.performances[0].accessibility).toEqual({});
    });
  },
);

it("reads the rest of the details from the paragraph layout", async () => {
  const movie = {
    id: "5517",
    title: "Fatherland",
    url: "https://riversidestudios.co.uk/whats-on/uGh-fatherland/",
    duration: "82 minutes",
    age_rating_class: "",
    performances: {},
  };
  const page = `
    <html><body><div class="te">
      <p>Age Rating: <strong>12A</strong></p>
      <p>Director: <strong>Paweł Pawlikowski</strong></p>
      <p>Cast: <strong>Sandra Hüller, Hanns Zischler</strong></p>
      <p>Year of Release: <strong>2026</strong></p>
    </div></body></html>
  `;
  const [output] = await transform(
    { movieListPage: [movie], moviePages: { [movie.url]: page } },
    {},
  );

  expect(output.overview).toMatchObject({
    year: "2026",
    directors: ["Paweł Pawlikowski"],
    actors: ["Sandra Hüller", "Hanns Zischler"],
    classification: "12A",
  });
});

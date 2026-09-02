const transform = require("../transform");

// Trimmed from the venue's own programme page for "Private Hire - 2 hour"
// (programme_id=3575342). Screen hire is sold as a programme like any other -
// it carries a runtime and a certificate ("none") - so nothing but the title
// separates it from a film.
const programmePage = (title, length) => `<html><body>
  <h1 class="prog-title">${title}</h1>
  <div class="prog-meta">
    <span class="prog-length">Length: ${length} mins</span>
    <span class="prog-cert">Cert: <img data-src="/bbfc/none.jpg" /></span>
  </div>
  <div class="synopsis"></div>
</body></html>`;

const url = (id) =>
  `https://www.arthousecrouchend.co.uk/programme/?programme_id=${id}`;

describe("arthouse crouch end private hire", () => {
  it("drops private hire programmes and keeps the films listed beside them", async () => {
    const movies = await transform(
      {
        moviePages: {
          [url(3575342)]: programmePage("Private Hire - 2 hour", 120),
          [url(10388172)]: programmePage("Late Fame", 100),
        },
      },
      {},
    );

    expect(movies.map(({ title }) => title)).toEqual(["Late Fame"]);
  });

  // The venue publishing nothing but hire slots is a real listing, not a
  // redesign - only an empty set of programme pages means the parse broke.
  it("does not read an all private hire listing as a broken page", async () => {
    await expect(
      transform(
        { moviePages: { [url(3575342)]: programmePage("Private Hire", 60) } },
        {},
      ),
    ).resolves.toEqual([]);
  });

  it("fails when no programme pages were found at all", async () => {
    await expect(transform({ moviePages: {} }, {})).rejects.toThrow(
      "No movies found - the page structure may have changed",
    );
  });
});

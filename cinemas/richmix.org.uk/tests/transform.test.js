const transform = require("../transform");

// A film page whose showtimes the transform can't read. The listing page led us
// here, so something was on and we failed to parse it - the case the empty
// check exists for.
const unparseableMoviePage = `<html><body><h1>Some Film</h1></body></html>`;

describe("rich mix transform with no listings", () => {
  it("returns nothing when the cinema has no films booked", async () => {
    // `retrieve` returns no movie pages only once it has proved the cinema page
    // is intact, so there is nothing here to have misread.
    await expect(transform({ moviePages: {} }, {})).resolves.toEqual([]);
  });

  it("fails when retrieved pages parse to nothing", async () => {
    await expect(
      transform(
        { moviePages: { "/cinema/some-film": unparseableMoviePage } },
        {},
      ),
    ).rejects.toThrow("No movies found - the page structure may have changed");
  });
});

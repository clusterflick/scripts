const transform = require("../transform");

// A season announced before its dates go on sale arrives with a single stub
// performance under day key "0", carrying tags but no timestamp and no booking
// link. Anything else in `performances` is a real showing.
const makeMovie = (performances) => ({
  id: "5066",
  title: "ROE-BELLIOUS YOUTH! BFI FAN Rip It Up Season",
  url: "https://riversidestudios.co.uk/whats-on/uM0-roe-bellious-youth/",
  duration: "",
  age_rating_class: "",
  performances,
});

const runTransform = (movie) =>
  transform(
    { movieListPage: [movie], moviePages: { [movie.url]: "<html></html>" } },
    {},
  );

describe("announced-but-unbookable seasons", () => {
  it("drops a stub performance with no timestamp", async () => {
    const [movie] = await runTransform(
      makeMovie({ 0: [{ tag_ids: ["101", "81029"], tag_name: "", html: "" }] }),
    );

    expect(movie.performances).toEqual([]);
  });

  it("keeps the bookable showings alongside a stub", async () => {
    const [movie] = await runTransform(
      makeMovie({
        0: [{ tag_ids: ["101", "81029"], tag_name: "", html: "" }],
        1784242800: [{ tag_ids: ["72"], timestamp: "1784293200", html: "" }],
      }),
    );

    expect(movie.performances).toHaveLength(1);
    expect(movie.performances[0].time).toBe(1784293200000);
  });

  // Skipping the stub must not turn a broken date parser into silence - only a
  // wholly absent timestamp is treated as "not on sale yet".
  it("still throws when a timestamp is present but unparseable", async () => {
    await expect(
      runTransform(
        makeMovie({
          1784242800: [{ tag_ids: ["72"], timestamp: "not-a-date" }],
        }),
      ),
    ).rejects.toThrow("createPerformance: invalid date");
  });
});

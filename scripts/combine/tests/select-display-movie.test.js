const selectDisplayMovie = require("../select-display-movie");
const { isTruncated } = require("../select-display-movie");

const movie = (id, title) => ({ id, title });

describe("selectDisplayMovie", () => {
  it("picks the shortest title", () => {
    const group = [
      movie("1", "Paddington in Peru + Q&A with director"),
      movie("2", "Paddington in Peru"),
    ];
    expect(selectDisplayMovie(group).id).toBe("2");
  });

  it("keeps the first of equally short titles", () => {
    const group = [movie("1", "Nosferatu"), movie("2", "NOSFERATU")];
    expect(selectDisplayMovie(group).id).toBe("1");
  });

  it("passes over a shorter title that has been truncated", () => {
    const group = [
      movie("1", "Paddington in Peru + Q&A with director"),
      movie("2", "Paddington in Peru + Q&A with..."),
    ];
    expect(selectDisplayMovie(group).id).toBe("1");
  });

  it("passes over a title truncated with an ellipsis character", () => {
    const group = [
      movie("1", "Paddington in Peru + Q&A with director"),
      movie("2", "Paddington in Peru + Q&A with…"),
    ];
    expect(selectDisplayMovie(group).id).toBe("1");
  });

  it("picks the shortest truncated title when every title is truncated", () => {
    const group = [
      movie("1", "Paddington in Peru + Q&A with the dir..."),
      movie("2", "Paddington in Peru + Q&A with..."),
    ];
    expect(selectDisplayMovie(group).id).toBe("2");
  });
});

describe("isTruncated", () => {
  it.each([
    ["Paddington in Peru + Q&A with...", true],
    ["Paddington in Peru + Q&A with…", true],
    ["Paddington in Peru + Q&A with... ", true],
    ["Sachein ... The Miracle Of Love", false],
    ["Paddington in Peru", false],
  ])("%j is %s", (title, expected) => {
    expect(isTruncated(title)).toBe(expected);
  });
});

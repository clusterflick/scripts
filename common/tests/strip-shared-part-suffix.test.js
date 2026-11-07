const stripSharedPartSuffix = require("../strip-shared-part-suffix");

describe("stripSharedPartSuffix", () => {
  test("drops a part named in words when the group has several parts", () => {
    const titles = [
      "Film is Fabulous! Showcase + Discussion: Recovered Part One",
      "Film is Fabulous! Showcase + Discussion: Recovered Part Two",
    ];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual(
      "Film is Fabulous! Showcase + Discussion: Recovered",
    );
  });

  test("drops a numbered part when the group has several parts", () => {
    const titles = ["The Long Night Part 1", "The Long Night Part 2"];
    expect(stripSharedPartSuffix(titles[1], titles)).toEqual("The Long Night");
  });

  test("treats digits, words and numerals as the same part", () => {
    const titles = ["Shoah - Part I", "Shoah - Part 2", "Shoah: Part Three"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual("Shoah");
  });

  test("drops a bracketed part", () => {
    const titles = ["Heimat (Part 1)", "Heimat (Part 2)"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual("Heimat");
  });

  test("keeps a part that is the film's own title", () => {
    const titles = ["Dune: Part Two", "Dune: Part Two"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual("Dune: Part Two");
  });

  test("keeps a part when the group has only one member", () => {
    const titles = ["Kaamelott: The Second Chapter (Part 1)"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual(titles[0]);
  });

  test("keeps the part when another member names no part", () => {
    const titles = ["Dune: Part Two", "Dune Part Two + Q&A"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual("Dune: Part Two");
  });

  test("keeps the part when the members have different titles", () => {
    const titles = ["Kill Bill Part 1", "Kill Bill Vol Part 2"];
    expect(stripSharedPartSuffix(titles[0], titles)).toEqual(
      "Kill Bill Part 1",
    );
  });

  test("leaves a title without a part alone", () => {
    expect(
      stripSharedPartSuffix("Picnic at Hanging Rock", [
        "Picnic at Hanging Rock",
      ]),
    ).toEqual("Picnic at Hanging Rock");
  });

  test("copes with no title", () => {
    expect(stripSharedPartSuffix()).toEqual("");
  });
});

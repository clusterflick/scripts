const stripSerialBlockSuffix = require("../strip-serial-block-suffix");

describe("stripSerialBlockSuffix", () => {
  test("drops an episode range", () => {
    expect(stripSerialBlockSuffix("Weird Waters (Episodes 1-3)")).toEqual(
      "Weird Waters",
    );
  });

  test("drops an episode list", () => {
    expect(
      stripSerialBlockSuffix("La maison des bois (Episodes 1, 2 and 3)"),
    ).toEqual("La maison des bois");
  });

  test("drops an episode block with no space after the label", () => {
    expect(
      stripSerialBlockSuffix("Monkey See Monkey Do (Episodes1-3)"),
    ).toEqual("Monkey See Monkey Do");
  });

  test("drops a single episode", () => {
    expect(stripSerialBlockSuffix("Through the Woods (Episode 4)")).toEqual(
      "Through the Woods",
    );
  });

  test("drops a range of parts", () => {
    expect(stripSerialBlockSuffix("The Journey (Parts 17 to 19)")).toEqual(
      "The Journey",
    );
  });

  test("keeps a single part, which can be the film's own title", () => {
    expect(
      stripSerialBlockSuffix("Kaamelott: The Second Chapter (Part 1)"),
    ).toEqual("Kaamelott: The Second Chapter (Part 1)");
  });

  test("keeps volumes", () => {
    expect(
      stripSerialBlockSuffix("Kill Bill: The Whole Bloody Affair (Vol 1 & 2)"),
    ).toEqual("Kill Bill: The Whole Bloody Affair (Vol 1 & 2)");
  });

  test("keeps a bracket that isn't a serial block", () => {
    expect(stripSerialBlockSuffix("Chhaava (Hindi)")).toEqual(
      "Chhaava (Hindi)",
    );
  });

  test("removes a block from the middle and tidies the spacing", () => {
    expect(
      stripSerialBlockSuffix("Twin Peaks (episodes 2-5) + Coffee"),
    ).toEqual("Twin Peaks + Coffee");
  });

  test("tidies a separator left dangling by the removal", () => {
    expect(stripSerialBlockSuffix("The Journey - (Parts 1 to 4)")).toEqual(
      "The Journey",
    );
  });

  test("leaves a title with no block untouched", () => {
    expect(stripSerialBlockSuffix("Picnic at Hanging Rock")).toEqual(
      "Picnic at Hanging Rock",
    );
  });

  test("handles an absent title", () => {
    expect(stripSerialBlockSuffix()).toEqual("");
  });
});

const { getAllCinemaNames } = require("../../cinemas");
const { getAllSourceNames } = require("../../sources");

// Each cinema and source directory name becomes the name of a data-retrieved
// release asset, and GitHub refuses some asset names by their extension:
// "name has a file extension that is not allowed". It fails only at the end of
// the retrieve run, when the release is uploaded, and voids every job's data.
// An id that would end in one of these takes a trailing dash ("thecliq.app-"),
// which generateShowingId drops from showing ids.
//
// GitHub doesn't publish the list, so add each extension here as it's hit.
const DISALLOWED_EXTENSIONS = [".app"];

describe("release asset names", () => {
  const names = [...getAllCinemaNames(), ...getAllSourceNames()];

  it("has names to check", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(DISALLOWED_EXTENSIONS)("has no name ending in %s", (extension) => {
    expect(names.filter((name) => name.endsWith(extension))).toEqual([]);
  });
});

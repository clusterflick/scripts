const { getPresenterNote } = require("../utils");

describe("getPresenterNote", () => {
  test("reads a name from the 'X presents' phrasing", () => {
    expect(
      getPresenterNote(
        "Waltham Forest Cinema Project presents a night of rare 16mm prints.",
      ),
    ).toEqual("Presented by Waltham Forest Cinema Project");
  });

  test("reads a name from the inverted 'Presented by X' phrasing", () => {
    expect(getPresenterNote("Presented by Distorted Frame")).toEqual(
      "Presented by Distorted Frame",
    );
  });

  test("stops the inverted phrasing before a gloss on who they are", () => {
    expect(
      getPresenterNote(
        "Presented by Distorted Frame, a film club which presents screenings of uniquely digital films.",
      ),
    ).toEqual("Presented by Distorted Frame");
  });

  test("ignores a credit that isn't at the start of the text", () => {
    expect(
      getPresenterNote(
        "The restoration was presented by the studio as a lost classic.",
      ),
    ).toBeNull();
  });

  test("ignores prose that happens to use 'presents' as a verb", () => {
    expect(
      getPresenterNote("The film presents a bleak vision of rural England."),
    ).toBeNull();
  });

  test("ignores a name that doesn't read like an organisation", () => {
    expect(getPresenterNote("Presented by kind permission of")).toBeNull();
  });
});

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

  test("reads a name from the sentence form of the inverted phrasing", () => {
    expect(
      getPresenterNote(
        "This event is presented to you by The Witch Of Popcorn",
      ),
    ).toEqual("Presented by The Witch Of Popcorn");
  });

  test("reads both names from a joint 'X in collaboration with Y' credit", () => {
    expect(
      getPresenterNote(
        "Waltham Forest Cinema Project in collaboration with Queer East showcase a decadent Taiwanese queer fantasy from 1961.",
      ),
    ).toEqual("Presented by Waltham Forest Cinema Project and Queer East");
  });

  test("keeps connecting words inside a collaborator's name", () => {
    expect(
      getPresenterNote(
        "Midweek Cinema in collaboration with The Museum of the Home bring a night of shorts.",
      ),
    ).toEqual("Presented by Midweek Cinema and The Museum of the Home");
  });

  test("ignores a collaboration credit that isn't between organisations", () => {
    expect(
      getPresenterNote(
        "Made in collaboration with local residents, the film follows a year on the estate.",
      ),
    ).toBeNull();
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

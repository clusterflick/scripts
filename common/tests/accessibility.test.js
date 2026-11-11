const {
  createAccessibility,
  createOccasions,
  createPerformance,
} = require("../utils");

describe("createAccessibility", () => {
  describe("title-based detection", () => {
    test.each([
      ["AD: The Wild Robot", { audioDescription: true }],
      ["The Wild Robot (AD)", { audioDescription: true }],
      ["Audio Described: The Wild Robot", { audioDescription: true }],
      ["The Wild Robot (Audio Description)", { audioDescription: true }],
    ])("detects audioDescription from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Relaxed Screening: The Wild Robot", { relaxed: true }],
      ["Relaxed Preview: The Wild Robot", { relaxed: true }],
      ["Relaxed The Wild Robot", { relaxed: true }],
      ["The Wild Robot (Relaxed)", { relaxed: true }],
      ["HAIRSPRAY - Dementia Friendly", { relaxed: true }],
      ["DEMENTIA FILM CLUB (FREE)", { relaxed: true }],
      [
        "Afro Sci-Fi Film Club 4 the Global Majority [queer & neurodivergent friendly]",
        { relaxed: true },
      ],
      ["Neurodiverse-Friendly Screening: The Wild Robot", { relaxed: true }],
      ["Autism-Friendly: Pillion", { relaxed: true }],
      ["Autism Friendly Screening: The Wild Robot", { relaxed: true }],
      ["Sensory Friendly: The Wild Robot", { relaxed: true }],
    ])("detects relaxed from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Parent & Baby: The Wild Robot", { babyFriendly: true }],
      ["Parents + Baby: The Wild Robot", { babyFriendly: true }],
      ["Baby & 1: The Wild Robot", { babyFriendly: true }],
      ["Kids Club: The Wild Robot", { babyFriendly: true }],
      ["Kids' Club: Space Jam (30th Anniversary)", { babyFriendly: true }],
      [
        "Kids’ Club: Tom and Jerry: The Forbidden Compass",
        { babyFriendly: true },
      ],
      ["FREE Kids Movie Club: The Wild Robot", { babyFriendly: true }],
      ["Leytonstone Library Kids Film Club", { babyFriendly: true }],
      ["Babykino: The Wild Robot", { babyFriendly: true }],
    ])("detects babyFriendly from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Dog Friendly Screening: The Wild Robot", { dogFriendly: true }],
      ["Dog-Friendly Screening: The Wild Robot", { dogFriendly: true }],
      ["Dog-Friendly - The Wild Robot", { dogFriendly: true }],
      ["Dog Friendly Cinema Screening: The Wild Robot", { dogFriendly: true }],
      [
        "Pooches & Popcorn (dog-friendly movie night): The Wild Robot",
        { dogFriendly: true },
      ],
    ])("detects dogFriendly from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Dog Day Afternoon"],
      ["The Mad Dog of Europe"],
      ["Isle of Dogs"],
    ])("does not detect dogFriendly from film title '%s'", (title) => {
      expect(createAccessibility(title, {})).toEqual({});
    });

    test.each([
      ["The Wild Robot - Subtitled", { subtitled: true }],
      ["Subtitled: The Wild Robot", { subtitled: true }],
      ["The Wild Robot (Subbed)", { subtitled: true }],
      ["The Wild Robot (Sub)", { subtitled: true }],
      ["The Wild Robot with Subtitles", { subtitled: true }],
    ])("detects subtitled from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test.each([
      ["Captioned: The Wild Robot", { hardOfHearing: true }],
      ["The Wild Robot (Caption)", { hardOfHearing: true }],
      ["The Wild Robot HOH", { hardOfHearing: true }],
      ["The Wild Robot (HoH)", { hardOfHearing: true }],
      ["Hard of Hearing: The Wild Robot", { hardOfHearing: true }],
      ["The Wild Robot SDH", { hardOfHearing: true }],
      ["The Wild Robot BSL", { hardOfHearing: true }],
      ["DESCRIPTIVE SUBTITLES", { hardOfHearing: true, subtitled: true }],
      ["The Wild Robot CC", { hardOfHearing: true }],
      ["The Wild Robot OC", { hardOfHearing: true }],
    ])("detects hardOfHearing from title '%s'", (title, expected) => {
      expect(createAccessibility(title, {})).toEqual(expected);
    });

    test("returns empty object for regular titles", () => {
      expect(createAccessibility("The Wild Robot", {})).toEqual({});
    });

    test.each([["Dementia 13"], ["Dementia (1955)"]])(
      "does not detect relaxed from film title '%s'",
      (title) => {
        expect(createAccessibility(title, {})).toEqual({});
      },
    );

    test("detects multiple accessibility features from one title", () => {
      expect(
        createAccessibility("Relaxed Subtitled: The Wild Robot", {}),
      ).toEqual({
        relaxed: true,
        subtitled: true,
      });
    });
  });

  describe("listing data takes precedence", () => {
    test("explicit listing data overrides title detection", () => {
      expect(
        createAccessibility("Subtitled: The Wild Robot", {
          subtitled: true,
          audioDescription: true,
        }),
      ).toEqual({
        subtitled: true,
        audioDescription: true,
      });
    });

    test("ignores false values in listing data", () => {
      expect(
        createAccessibility("The Wild Robot", {
          subtitled: false,
          audioDescription: true,
        }),
      ).toEqual({
        audioDescription: true,
      });
    });
  });

  describe("description-based detection", () => {
    test("detects subtitled from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "Shown with english subtitles",
        ),
      ).toEqual({ subtitled: true });
    });

    test("detects audio description from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "This screening includes audio description for visually impaired viewers",
        ),
      ).toEqual({ audioDescription: true });
    });

    test("does not detect audio description when negated in description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "this film screening does not have closed captions or audio description available",
        ),
      ).toEqual({});
    });

    test.each([
      ["This screening is dog friendly"],
      ["Join us for a dog-friendly screening of this festive classic."],
      [
        "Customers are welcome to bring their well behaved dogs into the cinema for this special screening.",
      ],
      [
        "Doors 6pm | Intro + Film + Intermission 6:30pm to 9:00pm | Adults 18+ only | Dogs welcome. Cult film night",
      ],
      ["Dogs are very welcome at this screening."],
    ])("detects dogFriendly from description '%s'", (description) => {
      expect(createAccessibility("The Wild Robot", {}, description)).toEqual({
        dogFriendly: true,
      });
    });

    test.each([
      ["A boy and his dog set out across the moors."],
      ["Her dog-friendly neighbours never suspect a thing."],
      ["Sadly this is not a dog-friendly screening."],
      ["Guide dogs are welcome."],
      ["Carers free, service dogs welcome."],
      ["Assistance dogs are welcome in the auditorium."],
      ["Guide dogs and service dogs are very welcome."],
      ["No dogs welcome, sorry."],
    ])("does not detect dogFriendly from description '%s'", (description) => {
      expect(createAccessibility("The Wild Robot", {}, description)).toEqual(
        {},
      );
    });

    test("detects relaxed from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "This is a relaxed screening with lower volume",
        ),
      ).toEqual({ relaxed: true });
    });

    test("detects baby friendly from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "A parent and baby screening with pram parking",
        ),
      ).toEqual({ babyFriendly: true });
    });

    test("detects hard of hearing from description", () => {
      expect(
        createAccessibility(
          "The Wild Robot",
          {},
          "Shown with captions for the hearing impaired",
        ),
      ).toEqual({ hardOfHearing: true });
    });

    test("ignores subtitles mentioned in a signpost to other screenings", () => {
      expect(
        createAccessibility(
          "The Odyssey",
          {},
          "Experience The Odyssey in IMAX 70mm. Find screenings of The Odyssey with subtitles for the D/deaf and those experiencing hearing loss.",
        ),
      ).toEqual({});
    });

    test("still detects real subtitles alongside a signpost", () => {
      expect(
        createAccessibility(
          "The Odyssey",
          {},
          "This screening is shown with english subtitles. Find screenings of The Odyssey with subtitles for the D/deaf and those experiencing hearing loss.",
        ),
      ).toEqual({ subtitled: true });
    });

    test("title detection takes precedence over description", () => {
      expect(
        createAccessibility(
          "AD: The Wild Robot",
          {},
          "Shown with english subtitles",
        ),
      ).toEqual({ audioDescription: true, subtitled: true });
    });

    test("listing data takes precedence over description", () => {
      expect(
        createAccessibility("The Wild Robot", { relaxed: true }, ""),
      ).toEqual({ relaxed: true });
    });

    test("handles empty description", () => {
      expect(createAccessibility("The Wild Robot", {})).toEqual({});
    });
  });

  describe("audioDescription title matcher does not false-positive", () => {
    test("does not match lowercase 'ad' in words", () => {
      expect(createAccessibility("The Adventures of Tintin", {})).toEqual({});
    });

    test("does not match 'Bad Boys'", () => {
      expect(createAccessibility("Bad Boys", {})).toEqual({});
    });
  });

  describe("relaxed title matcher does not false-positive", () => {
    test.each([
      ["Free World Autism Awareness Day Screening: Amélie"],
      ["ARKIVE MAKES SCENTS IMMERSIVE SENSORY CINEMA EXPERIENCE"],
      ["Send Help"],
    ])("does not detect relaxed from '%s'", (title) => {
      expect(createAccessibility(title, {})).toEqual({});
    });
  });
});

describe("createPerformance accessibility", () => {
  const base = {
    date: new Date("2026-11-21T10:45:00Z"),
    url: "https://example.com/book",
    occasions: createOccasions("The Wild Robot"),
  };
  const read = (notesList, accessibility = {}) =>
    createPerformance({ ...base, notesList, accessibility }).accessibility;

  test.each([
    [["Kids Club"], { babyFriendly: true }],
    [["dementia friendly"], { relaxed: true }],
    [["DESCRIPTIVE SUBTITLES"], { hardOfHearing: true, subtitled: true }],
    [["Hard of hearing subtitles"], { hardOfHearing: true, subtitled: true }],
    [["Dog Friendly"], { dogFriendly: true }],
    [["Laser", "Kids Club"], { babyFriendly: true }],
  ])("reads a label in the notes %j", (notesList, expected) => {
    expect(read(notesList)).toEqual(expected);
  });

  test("reads a long note as prose, with the description rules", () => {
    expect(
      read([
        "Dog Friendly: Customers are welcome to bring their well behaved dogs into the cinema for this special screening",
      ]),
    ).toEqual({ dogFriendly: true });
    // A bare mention in prose is not a statement about this screening
    expect(
      read([
        "Silver Screen: Everyone welcome, and guests with a baby or a relaxed attitude to trailers will enjoy the complimentary tea",
      ]),
    ).toEqual({});
  });

  test.each([
    [["Ad and Trailer Free"]],
    [["Wheelchair Accessible"]],
    [["Part of UK Jewish Film Festival 2026"]],
    [["English Language"]],
  ])("reads nothing from %j", (notesList) => {
    expect(read(notesList)).toEqual({});
  });

  test("adds to what the venue's own data carries, never removes", () => {
    expect(read(["Kids Club"], { audioDescription: true })).toEqual({
      audioDescription: true,
      babyFriendly: true,
    });
  });

  test("leaves a performance with no accessibility untouched", () => {
    expect(
      createPerformance({ ...base, notesList: ["Kids Club"] }).accessibility,
    ).toBeUndefined();
  });
});

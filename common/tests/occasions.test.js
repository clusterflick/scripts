const { createOccasions, createPerformance } = require("../utils");

// The descriptions below are the venues' own words, taken from a November 2026
// retrieve, so a change to the rules is tested against what venues actually
// write rather than what we imagine they do.

const at = (iso) => ({ date: new Date(iso) });

describe("createOccasions", () => {
  describe("title-based detection", () => {
    test.each([
      ["Devi + Introduction", { intro: true }],
      ["Never Watching Movies: COOLEY HIGH + Intro", { intro: true }],
      ["1 in 2 + Q&A", { qAndA: true }],
      ["Possible Love + ScreenTalk", { qAndA: true }],
      [
        "Father + Q&A with director Tereza Nvotová",
        { qAndA: { guests: ["Tereza Nvotová"] } },
      ],
      [
        "Music Video Preservation Society with special guest Tim Pope",
        { guestAppearance: { guests: ["Tim Pope"] } },
      ],
      ["The Phantom of the Opera + live score", { liveScore: true }],
      ["UK PREMIERE Passe Montagne", { premiere: { region: "uk" } }],
      ["The Dull Ice Flower [UK Premiere]", { premiere: { region: "uk" } }],
      ["PREVIEW - Dune: Part Three", { preview: true }],
      // David Lean Cinema's event attributes
      ["+Q&A", { qAndA: true }],
      ["+ Q&A", { qAndA: true }],
      ["& Q&A", { qAndA: true }],
      ["UK PREMIERE Mirage + Q&A", { premiere: { region: "uk" }, qAndA: true }],
      // Hart Shoreditch, through Eventbrite
      [
        "Switches Screening + Director Conversation | Lumière Noire",
        { inConversation: true },
      ],
    ])("reads '%s'", (title, expected) => {
      expect(createOccasions(title)).toEqual(expected);
    });

    test.each([
      ["The Wild Robot"],
      ["Interstellar"],
      ["Introducing the Dwights"],
      ["Members' Preview Screening: Wicked"],
      // The Lexi's note for its seniors' group: the audience talking
      ["Talking Pictures: A friendly film discussion group for seniors"],
    ])("finds nothing in '%s'", (title) => {
      expect(createOccasions(title)).toEqual({});
    });

    test("a recorded introduction isn't someone in the room", () => {
      expect(createOccasions("Hamnet + pre-recorded Q&A")).toEqual({});
    });

    test("a named appearance makes a bare guest appearance redundant", () => {
      expect(createOccasions("In person: Q&A with Mike Leigh")).toEqual({
        qAndA: { guests: ["Mike Leigh"] },
      });
    });
  });

  describe("description-based detection", () => {
    test("reads a sentence about the screening (ICA, The Eel)", () => {
      const description =
        "Crowned with the Palme d’Or at Cannes in 1997, The Eel made Imamura one of only ten filmmakers to have received the award twice.\n" +
        "This screening will be introduced by Benjamin Crais.\n" +
        "Benjamin Crais is a writer, editor, and film programmer based in New York.";
      expect(
        createOccasions("The Eel", {}, description, at("2026-12-08T18:30Z")),
      ).toEqual({ intro: { guests: ["Benjamin Crais"] } });
    });

    test("names every guest, without the roles between them", () => {
      expect(
        createOccasions(
          "Who is Still Alive + ScreenTalk",
          {},
          "This screening, a UK premiere, will be followed by a ScreenTalk with Nicolas Wadimoff and Jawdat Khoudary.",
          at("2026-11-13T19:00Z"),
        ),
      ).toEqual({
        qAndA: { guests: ["Nicolas Wadimoff", "Jawdat Khoudary"] },
        premiere: { region: "uk" },
      });
    });

    test.each([
      [
        "a role before the name",
        "This screening will be introduced by guest curator Leo Krenzer.",
        { intro: { guests: ["Leo Krenzer"] } },
      ],
      [
        "a capitalised role inside the name",
        "There will be an intro from Writer/Director Robert Eggers on the night.",
        { intro: { guests: ["Robert Eggers"] } },
      ],
      [
        "a name missing the space after its role",
        "+ Q&A with Vanessa Roth and co-producerJustin Cohen MBE",
        { qAndA: { guests: ["Vanessa Roth", "Justin Cohen MBE"] } },
      ],
      [
        "a director of photography",
        "Followed by a Q&A with director Ana-Felicia Scutelnicu and DoP Javier Palicio",
        { qAndA: { guests: ["Ana-Felicia Scutelnicu", "Javier Palicio"] } },
      ],
      [
        "a plus sign inside a name",
        "The screening will be followed by a Q&A with London Trans+ Pride.",
        { qAndA: { guests: ["London Trans+ Pride"] } },
      ],
      [
        "an em dash with no spaces around it",
        "The screening will be introduced by Silvia Demetilla—founder of the collective.",
        { intro: { guests: ["Silvia Demetilla"] } },
      ],
      [
        "a name followed by where they're from",
        "This screening will include an intro by Vivien Halas and Jez Stewart of the BFI National Archive.",
        { intro: { guests: ["Vivien Halas", "Jez Stewart"] } },
      ],
      [
        "an organisation after an article",
        "The screening will be followed by a Q&A with the editor of the Guardian, Katharine Viner.",
        { qAndA: { guests: ["Katharine Viner"] } },
      ],
      [
        "a work named before the guest",
        "This screening will be introduced by the editor of Terminus, Hugh Raggett.",
        { intro: { guests: ["Hugh Raggett"] } },
      ],
      [
        "a job title after the name",
        "This screening will include an intro by Xavier Alexandre Pillai, BFI TV Programmer.",
        { intro: { guests: ["Xavier Alexandre Pillai"] } },
      ],
      [
        "an apposition joined with an ampersand",
        "This screening will include an intro by Caroline Cassin, Women & Cocaine film curator.",
        { intro: { guests: ["Caroline Cassin"] } },
      ],
      [
        "a single word, which is as often a role as a first name",
        "This screening will be introduced by film club organiser Joel.",
        { intro: true },
      ],
      [
        "a name that isn't a person",
        "This screening will be introduced by The Cinema Obsessive.",
        { intro: true },
      ],
      [
        "an apposition after the name",
        "This screening will be introduced by David Jenkins, editor of Little White Lies.",
        { intro: { guests: ["David Jenkins"] } },
      ],
      [
        "a capitalised descriptor before the name",
        "With an introduction & post-screening Q&A from local historian & Hitchcock expert Gary Lewis (of Hastings).",
        { intro: true, qAndA: { guests: ["Gary Lewis"] } },
      ],
      [
        "a capitalised role before the name",
        "The screening will be followed by a Q&A with Director Robin Mahoney.",
        { qAndA: { guests: ["Robin Mahoney"] } },
      ],
      [
        "an honorific",
        "The screening will be followed by a Q&A with Dr. Purva Tavri.",
        { qAndA: { guests: ["Dr. Purva Tavri"] } },
      ],
      [
        "a list of names",
        "The screening will be followed by a panel discussion with Claire Nicolas, Abla Kandalaft and Jamal Awar.",
        {
          panel: { guests: ["Claire Nicolas", "Abla Kandalaft", "Jamal Awar"] },
        },
      ],
      [
        // The Lexi, Black History Studies: Barrel Children. The introducer is
        // named before the verb, where no name is read.
        "an introduction of the films, and a discussion with a named guest",
        "Charmaine Simpson, founder and CEO of Black History Studies , will introduce the films and lead a discussion following this screening with director Nadine White.",
        { intro: true, inConversation: { guests: ["Nadine White"] } },
      ],
      [
        // The Rio
        "a Q&A discussion",
        "The screening is followed by a Q&A discussion with Rabbi Herschel Gluck and filmmakers Winstan Whitter & Elin Moe.",
        {
          qAndA: {
            guests: ["Rabbi Herschel Gluck", "Winstan Whitter", "Elin Moe"],
          },
        },
      ],
      [
        // Birkbeck
        "a discussion panel",
        "The programme will feature a post-screening discussion panel with Michal Oleszczyk following the documentary We Film the People (2013) by Ania Szczepanska.",
        { panel: { guests: ["Michal Oleszczyk"] } },
      ],
      [
        // The Phoenix
        "an introduction of the film by someone named before it",
        "Writer and researcher Manishita Dass will introduce the film, its themes and place within Ray’s oeuvre.",
        { intro: true },
      ],
      [
        "a live score",
        "This performance will feature a live score performed by Hugo Max.",
        { liveScore: { performers: ["Hugo Max"] } },
      ],
    ])("reads %s", (_, description, expected) => {
      expect(
        createOccasions("Film", {}, description, at("2026-11-11T19:00Z")),
      ).toEqual(expected);
    });

    test.each([
      [
        "a synopsis",
        "A new English teacher, John Keating (Robin Williams), is introduced to an all-boys preparatory school.",
      ],
      [
        "a synopsis meeting in person",
        "Things manage to become even more complicated when the boy and girl decide to meet in person.",
      ],
      [
        "a booking footer",
        "£1.50 booking fee per online/phone transaction. No fee when tickets are booked in person.",
      ],
      [
        "a negation",
        "PLEASE NOTE: Tommy Wiseau will NOT be in attendance for these screenings!!!",
      ],
      [
        "a past event",
        "Our screening on Thursday 5 September, 2024 was introduced by Tony Rayns.",
      ],
      [
        "a recorded Q&A, misspelt",
        "The film and the recordered Q&A will be captioned.",
      ],
      [
        "a video introduction",
        "This screening will feature a video introduction by Indigenous Caribbean Filmmaker Akley Olten.",
      ],
      [
        "a filmed interview with a special guest",
        "This special Doctor Who Day screening also includes exclusive bonus material, featuring previously unseen content and a brand-new interview with a special guest.",
      ],
      [
        "special guests in a filmed concert",
        "Featuring the extraordinary voice of Emma Kok, renowned tenors and special guests, this production is designed to delight audiences.",
      ],
      [
        // Hart Shoreditch's Lumière Noire, through Eventbrite
        "a discussion among the audience",
        "💬 A post-film discussion where every voice is welcome",
      ],
      [
        // Sands Films
        "a programme that will introduce films",
        "The second selection of films will introduce films about the war made in Spain under Franco.",
      ],
      [
        "programme copy introducing audiences to something",
        "This season introduces audiences to the cinema of Iran.",
      ],
      [
        "a film's history",
        "The film premiered (and won the Special Jury Prize) at the Venice Film Festival.",
      ],
    ])("ignores %s", (_, description) => {
      expect(
        createOccasions("Film", {}, description, at("2026-11-11T19:00Z")),
      ).toEqual({});
    });

    test("a work put in conversation with the film isn't a guest (Ibraaz, Turang)", () => {
      // The second sentence names the performance's own date, so it is read.
      const description =
        "With an introduction from Bunga Siagian, cultural producer, researcher, and daughter of Bachtiar Siagian, the screening presents the restored film as an act of narrative reclamation and an archive of decolonisation, created at a time of radical political upheaval in the country of its creation. This screening of Turang is curated by May Adadol Ingawanij with Ibraaz in conversation with the final chapter of Taring Padi’s Rakyat Pasti Menang at Ibraaz London, which runs until 22 November, 2026.";
      expect(
        createOccasions("Turang", {}, description, at("2026-11-22T15:00Z")),
      ).toEqual({ intro: { guests: ["Bunga Siagian"] } });
    });

    describe("a sentence naming a date", () => {
      const description =
        "Our screening on Saturday 21 November will be followed by a Q&A with director Rafael Manuel.";

      test("applies to the performance on that date", () => {
        expect(
          createOccasions(
            "Filipiñana",
            {},
            description,
            at("2026-11-21T18:00Z"),
          ),
        ).toEqual({ qAndA: { guests: ["Rafael Manuel"] } });
      });

      test("doesn't apply to the run's other performances", () => {
        expect(
          createOccasions(
            "Filipiñana",
            {},
            description,
            at("2026-11-22T18:00Z"),
          ),
        ).toEqual({});
      });

      test("compares the London date, not the UTC one", () => {
        // 00:30 BST on 21 September is still 20 September in UTC
        expect(
          createOccasions(
            "Film",
            {},
            "The screening on 21 September will be introduced by Tom Cunliffe.",
            at("2026-09-20T23:30Z"),
          ),
        ).toEqual({ intro: { guests: ["Tom Cunliffe"] } });
      });

      test.each([
        ["The screening on the 22nd of November will be followed by a Q&A."],
        ["The screening on November 22nd will be followed by a Q&A."],
        [
          "The 8.45pm screening on Sunday 22 November will be followed by a Q&A.",
        ],
      ])("reads '%s'", (sentence) => {
        expect(
          createOccasions("Film", {}, sentence, at("2026-11-22T20:45Z")),
        ).toEqual({ qAndA: true });
      });

      test("checks the year when one is given", () => {
        expect(
          createOccasions(
            "Film",
            {},
            "The screening on 22 November 2025 will be followed by a Q&A.",
            at("2026-11-22T20:45Z"),
          ),
        ).toEqual({});
      });
    });

    test("an undated sentence applies to every performance", () => {
      const description =
        "This performance will feature a live score performed by Hugo Max.";
      for (const iso of ["2026-11-11T19:00Z", "2026-11-25T19:00Z"]) {
        expect(createOccasions("Film", {}, description, at(iso))).toEqual({
          liveScore: { performers: ["Hugo Max"] },
        });
      }
    });

    test("a description needs the performance's date", () => {
      expect(() =>
        createOccasions("Film", {}, "This screening will feature a Q&A."),
      ).toThrow("needs the performance's { date }");
    });
  });

  describe("structured listing data", () => {
    test("is read like accessibility, dropping false values", () => {
      expect(createOccasions("Film", { intro: true, qAndA: false })).toEqual({
        intro: true,
      });
    });

    test("keeps details found in the text when the listing only flags it", () => {
      expect(
        createOccasions("Film + Q&A with Mike Leigh", { qAndA: true }),
      ).toEqual({ qAndA: { guests: ["Mike Leigh"] } });
    });

    test("puts its own details first, joined with the text's", () => {
      expect(
        createOccasions(
          "Film + Q&A with Mike Leigh",
          { qAndA: { guests: ["Marianne Jean-Baptiste"] } },
          "",
        ),
      ).toEqual({
        qAndA: { guests: ["Marianne Jean-Baptiste", "Mike Leigh"] },
      });
    });

    test("writes an object with no details as true", () => {
      expect(createOccasions("Film", { intro: { guests: [] } })).toEqual({
        intro: true,
      });
    });

    test.each([
      [{ talk: true }, 'unknown occasion "talk"'],
      [{ intro: { performers: ["X"] } }, '"intro" has no detail "performers"'],
      [{ premiere: { region: "paris" } }, "unknown premiere region paris"],
      [{ preview: { guests: ["X"] } }, '"preview" has no detail "guests"'],
      [{ qAndA: "yes" }, '"qAndA" must be true or an object of details'],
    ])("rejects %j", (occasions, message) => {
      expect(() => createOccasions("Film", occasions)).toThrow(message);
    });
  });
});

describe("createPerformance occasions", () => {
  const base = { date: new Date("2026-11-11T19:00Z"), url: "https://a.b/c" };

  test("is required, so no venue skips its title and description", () => {
    expect(() => createPerformance(base)).toThrow("occasions is required");
  });

  test("adds what the notes say", () => {
    const performance = createPerformance({
      ...base,
      notesList: ["This screening features a special in person Q&A appearance"],
      occasions: { intro: true },
    });
    expect(performance.occasions).toEqual({ intro: true, qAndA: true });
  });

  test("reads each note on its own", () => {
    const performance = createPerformance({
      ...base,
      notesList: ["Q&A with Mike Leigh", "Pre-recorded introduction"],
      occasions: {},
    });
    expect(performance.occasions).toEqual({
      qAndA: { guests: ["Mike Leigh"] },
    });
  });
});

describe("Eventive descriptions", () => {
  const parseDescription = require("../eventive/parse-description");

  test("keep each block on its own line, so a name doesn't run into a heading", () => {
    const description = parseDescription(
      "<h1>CLOSING NIGHT GALA</h1><h3>+ Q&amp;A with director Alexandre Arcady</h3><p><strong>PRICES:</strong></p>",
    );
    expect(description).toBe(
      "CLOSING NIGHT GALA\n+ Q&A with director Alexandre Arcady\nPRICES:",
    );
    expect(
      createOccasions("The Last Concert", {}, description, {
        date: new Date("2026-11-22T19:00Z"),
      }),
    ).toEqual({ qAndA: { guests: ["Alexandre Arcady"] } });
  });
});

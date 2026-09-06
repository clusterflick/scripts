const { isNonFilmEvent, isNotNonFilmEvent } = require("../is-non-film-event");

describe("isNonFilmEvent", () => {
  test.each([
    ["Community Pilates"],
    ["Bearpit Karaoke"],
    ["Paint your own Carafe or  Shot Glasses"],
    ["Sip and Paint Experience"],
    ["THE WEEKND FANPARK"],
    ["Crick Bioimage Analysis Symposium 2026"],
    ["Business Networking | Healthcare & Wellness Industry"],
    ["Media, PR & Communications | London Business Networking Evening"],
    ["Clinical, Care & Performance Networking Reception – London"],
    ["Fashion Business, Startups Industry Leaders Networking Night"],
    ["Visionary Collective Artists & Industry Pros Networking Night"],
    ["Medtech Innovation: Shaping the Future of Digital Health in London"],
    ["Medical Connections | Enterprise Leaders for NHS Service Providers"],
    ["WHAT HAPPENS NEXT - Thursday Third Space & Games for Singles 21+"],
    ["Free Salsa & Bachata Outdoor Party - SABOR"],
    ["Aircraft Cabin Air Conference 2026"],
    [
      "one6G Summit 2026: Connected Intelligence for 6G (Sept. 10-11, London, UK)",
    ],
    ["BSNM Annual Meeting 2026"],
    ["Smithsonian Starstruck: An Immersive Experience"],
    ["Neon Naked Life Drawing"],
    ["Tate Modern: Official Discovery Tour"],
    ["Advanced Photography Workshop + Photoshoot | London"],
    ["AdTech Networking Social for CEOs & Entrepreneurs Meetup"],
    ["BENGALI MUSLIM MARRIAGE EVENT | 1-to-1 Single LONDON Meetup | 5th Sept"],
    [
      "BLACK & AFRICAN MUSLIM MARRIAGE | 1-to-1 Single LONDON Meetup | 5th Sept",
    ],
    ["Ocean Film Festival World Tour: 22 OCT - Early Dinner Reservation"],
    ["Conferencing 4 Hour"],
    ["Loncon Creative Singing Diva singing course showcase"],
    ["JOHNNIE WALKER PRESENTS R&B THURSDAYS:  KASH/PHARXOH"],
    ["LIVE CONCERT: GYPSY DYNAMITE"],
    ["Mary Jane Lowe & Matt Redman Live Concert"],
    ["LIVE CONCERT - FREE ENTRY: Saskia Leigh Martić"],
  ])("flags '%s' as a non-film event", (title) => {
    expect(isNonFilmEvent({ title })).toBe(true);
  });

  test.each([
    ["Community Cinema at UCL East – Pride"],
    ["Big Screen Karaoke"],
    ["War Paint: Women at War"],
    ["David Lynch Sip and Paint"],
    ["Guillermo del Toro Sip and Paint"],
    ["ENGLAND FANPARK: ENGLAND V SERBIA"],
    ["Introduction to Film Analysis and Filmmaking"],
    ["Risky Business"],
    ["Unfinished Business"],
    ["Women in Film & TV networking - LIFF 2025"],
    ["Single White Female"],
    ["CLASSIC MATINEE: PERFORMANCE"],
    ["Mambar Pierrette - Fashion in Film Festival 2025"],
    ["Official Selection: La Salsa Vive (Salsa Lives)"],
    ["The Cabinet of Dr. Caligari (1920) + Live Organ"],
    ["A.I. Artificial Intelligence"],
    ["The 23rd Annual Animation Show of Shows: UK screening"],
    ["Filmmaking Course Showcase"],
    ["The Blinking Buzzards – Quarterly Meeting"],
    ["The Dinner"],
    ["Dinner at Eight"],
    ["Pitchblack Playback: Mystery Album Club - Post-Modern R&B"],
    ["Haxan: Witchcraft Through the Ages + Live Score"],
    ["Silent Film & Live Music: A Colour Box"],
    ["Cine-Concert: new short films with live music"],
    ["Preview Screening & Concert"],
  ])("does not flag '%s' as a non-film event", (title) => {
    expect(isNonFilmEvent({ title })).toBe(false);
  });
});

describe("isNotNonFilmEvent", () => {
  test("returns true for film events", () => {
    expect(isNotNonFilmEvent({ title: "The Wild Robot" })).toBe(true);
  });

  test("returns false for non-film events", () => {
    expect(isNotNonFilmEvent({ title: "Bearpit Karaoke" })).toBe(false);
  });
});

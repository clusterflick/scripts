const isBilledAsShortFilm = require("../is-billed-as-short-film");
const normalizeTitle = require("../normalize-title");

const billedAsShort = (title) =>
  isBilledAsShortFilm(title, normalizeTitle(title));

describe("isBilledAsShortFilm", () => {
  test.each([
    ["Saddled - Short Film - UK Première"],
    ["The Breath of Bones | Short Film | Premiere"],
    ["TEN TO SIX - Short Film"],
    ["THE VOTE - SHORT FILM PREMIERE"],
    ["Burnt Toast with Marmite: Short Film Premiere"],
    ["Climate Justice Short Film Screening"],
    ["It's Behind You - a short film"],
    ["Short Film: A Night Where I Am Absent From Nowhere"],
    ["At This Moment, It's Us - Short Film Premiere + Q&A"],
    ["Relationship Drama - A Night of Short Films"],
  ])("flags '%s'", (title) => {
    expect(billedAsShort(title)).toBe(true);
  });

  test.each([
    // The words are the film's name
    ["Kino Polonia: A SHORT FILM ABOUT KILLING"],
    ["A Short Film About Love"],
    // The short is the extra item on a feature's bill
    ["Pink Narcissus + WOFFF Short Film"],
    ["From Hilde, With Love + Kate Bush Short Film"],
    ["Ghibliotheque presents: Arco + Ugo Bienvenu Short Films & Recorded Q&A"],
    ["BFI Melodrama “2046” plus Short Film “I Am Alive”"],
    ["#ClimateScam with short film Climate Anxiety"],
    ["Bend It Like Beckham + Short Film"],
    // The marker names the event, not the film
    [
      "Tibet Film Festival London Short Film Competition and UK Premiere of My Sweet Pala",
    ],
    ["Kino London Short Film Festival: Kino Pulp"],
    ["Turn Up Film Festival - Short Film Competition Part 1 + Q&A"],
    // No marker at all
    ["Saddled"],
    ["Short Cuts : 35mm Roadshow Tour"],
  ])("does not flag '%s'", (title) => {
    expect(billedAsShort(title)).toBe(false);
  });
});

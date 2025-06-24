const knownRemovablePhrases = require("./known-removable-phrases");
const standardizePrefixingForTheatrePerformances = require("./standardize-prefixing-for-theatre-performances");

const matchesOpenPrefix = (title, phrase) =>
  title.match(new RegExp(`\\s+${phrase}[:;]\\s+(.*?)$`, "i"));

const matchesStartingPrefix = (title, phrase) =>
  title.match(new RegExp(`(?:^|\\s+)${phrase}[:;]\\s+(.*?)$`, "i"));

function normalizeTitle(title, options) {
  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  // Specific corrections
  const corrections = [
    [/^Times\+ Preview$/i, "The Last Journey"], // NOTE: This may need updated in the future if there's a new times preview out with a similarly poor title
    [" + Zog", " and Zog"],
    [" + Superworm", " and Superworm"],
    [/^LD:/i, "LD Friendly:"],
    [/^Re-Viewing /i, ""],
    [/housefull 5 (a|b)(\s+|$)/i, "housefull 5 "],
    // Remove prefix separators which will cause later processing to strip the wrong section
    [/Star Wars: Episode ([IV]+) - /i, "Star Wars: Episode $1 "], // Remove the dash
    ["Rafadan Tayfa - Kapadokya", "Rafadan Tayfa: Kapadokya"],
    ["Average Rob -", "Average Rob:"],
    ["Roger Waters -", "Roger Waters:"],
    ["Closing Night + Awards", "Closing Night and Awards"],
    ["Poetry Slam", "Event: Poetry Slam"],
    ["Scared To Dance -", "Scared To Dance "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["Green Screen -", "Green Screen "],
    [/^SILVER\s*?SCREEN -/i, "SILVER SCREEN"],
    ["SUBTITLED -", "SUBTITLED "],
    [/^RELAXED -/i, "Relaxed screening: "],
    ["RELAXED Disney's", "Relaxed screening: Disney's"],
    ["Mamma Mia-", "Mamma Mia -"],
    ["CELLULOID JAM! –", "CELLULOID JAM! "],
    ["Saturday night at the movies -", "Saturday night at the movies:"],
    ["Pierre Boulez - Boulez", "Pierre Boulez "],
    ["twin peaks - ", "twin peaks "],
    ["- Part ", "Part "],
    ["- FREE ENTRY", "FREE ENTRY"],
    ["- Year of the Rabbit", "Year of the Rabbit"],
    ["- Live Arena Tour", "Live Arena Tour"],
    ["- Drunken Scorpion Presents ", "- Drunken Scorpion "],
    [/^Baby\s*?\+\s*?1:?\s*/i, "Baby & 1 "],
    ["friends + crew", "friends & crew"],
    [" + Short Film: ", " + Short Film "],
    ["- Celebrating", " - Celebrating"],
    ["- Classics", " - Classics"],
    ["- Pride", " - Pride"],
    ["- International", " - International"],
    ["Björk’s", "Björk"],
    ["Funny Games / Funny Games US", "Funny Games Double Bill"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["The Return The Return", "The Return"],
    ["Wildnerness", "Wilderness"],
    [/\s+du$/i, ""], // Dubbed
    [/\s+su$/i, ""], // subbed
    [/\s+3d$/i, ""], // 3d
    ["Vasthunnam", "Vasthunam"],
    ["Melagaon", "Malegaon"],
    ["Carvaggio", "Caravaggio"],
    ["10180", "1080"],
    ["unknwon", "unknown"],
    ["Shanthamee Reethriyil", "Shanthamee Raathriyil"],
    ["Shanthamee Rathriyil", "Shanthamee Raathriyil"],
    ["Aabhyanthara Kuttavvali", "Aabhyanthara Kuttavaali"],
    ["Daakuaan Da Munda", "Dakuaan Da Munda"],
    ["Vysanasametham Bandhumithradhikal", "Vyasanasametham Bandhumithradhikal"],
    [
      "Vyasana Sametham Bandhu Mithradhikal",
      "Vyasanasametham Bandhumithradhikal",
    ],
    ["Frozen 2", "Frozen II"],
    [/\s+terminator 2$/i, " Terminator 2 Judgment Day"],
    [/^Relaxed Mufasa/i, "Relaxed screening: Mufasa"],
    ["behaviour", "behavior"],
    ["Lynch: Fire Walk With Me", "Lynch: Twin Peaks Fire Walk With Me"],
    ["War Paint: Woman at War", "War Paint: Women at War"],
    ["Big Night Out: New Moon", "Big Night Out: The Twilight Saga: New Moon"],
    ["David Lynch: The Short Films", "The Short Films of David Lynch"],
    ["Battleground + intro ", "Battlefield + intro "], // BFI gets the name of the movie wrong
    ["The Dawn of Impressionism", "Dawn of Impressionism"],
    [/ - Paris,? 1874/i, ": Paris 1874"],
    [" - Poets and Lovers", ": Poets and Lovers"],
    [/Last Supper (– )?Part 1/i, "Last Supper"],
    ["The Last Supper", "Last Supper"],
    ["Veera Dheera Sooran: Part 2", "Veera Dheera Sooran"],
    ["Mulholland Dr.", "Mulholland Drive"], // Otherwise we match the TV pilot of the same name
    ["W&G:", "Wallace & Gromit:"],
    [": Curse Of The Were-Rabbit", ": The Curse Of The Were-Rabbit"],
    ["14 Days (Girlfriend Intlo)", "14 Days Girlfriend Intlo"],
    ["SCSEVENTEEN", "SEVENTEEN"],
    ["Björk's", "Björk:"],
    ["Children’s Cinema", "The Notebook Children's Cinema"], // Stop this accidentally matching "Children in the Cinema"
    ["Eurovision Grand Final Live", "Eurovision Grand Final"], // Remove live for better combining
    [
      "Films That Fuck",
      "Films That Fuck: Re-uses of Pornography in Moving Image Practices During the HIV/AIDS Crisis and the Present",
    ],
    ["(True True)", "(True)²"], // Fix for Evangelion: Death (True)²
    ["3.0+1.01", "3.0+1.0"], // Fix for Evangelion: 3.0+1.0 Thrice Upon a Time to combine with updated version release
    [
      /^The End of Evangelion$/i,
      "Neon Genesis Evangelion: The End of Evangelion",
    ],
    ["Terror Dome", "Terrordome"],
    ["Wu Viet", "Woo Viet"],
    ["The Adventures of Tintin: ", "Tintin and "],
    [
      "Dangerous Encounters: 1st Kind",
      "Dangerous Encounters of the First Kind",
    ],
    ["Where Is the Friend's Home?", "Where Is the Friend's House?"],
    ["Ghidrah", "Ghidorah"], // Fix for Ghidorah, the Three-Headed Monster
    ["½", " 1/2"],
    ["Mr. Hulot", "Monsieur Hulot"], // Fix for Monsieur Hulot's Holiday
    [/^Mishima$/i, "Mishima: A Life in Four Chapters"],
    ["My Heart Is That Eternal Love", "My Heart Is That Eternal Rose"],
    [/^A Tale of Sorrow$/i, "A Tale of Sorrow and Sadness"],
    [/^Eftihia$/i, "My Name is Eftihia"],
    ["Limonov: The Ballad of Eddie", "Limonov: The Ballad"],
    ["Masculine-Feminine", "Masculin Feminin"],
    ["Moutains", "Mountains"], // Fix for All The Mountains Give
    ["Le Nozze di Figaro", "The Marriage of Figaro"],
    ["La Nozze di Figaro", "The Marriage of Figaro"],
    [": Michelangelo -", ": Michelangelo –"],
    [" - Michelangelo:", ": Michelangelo –"],
    ["Sanrizuka 3", "Sanrizuka Notes 3"],
    [
      "Bluey Let's Play Chef",
      "Bluey at the Cinema: Let’s Play Chef Collection",
    ],
    [": Let's Chef Collection", " Let’s Play Chef Collection"],
    [": Chef Collection", " Let’s Play Chef Collection"],
    ["Maastricht:", "Maastricht Concert:"],
    ["Sardaar Ji", "Sardaarji"],
    ["Sardar Ji", "Sardaarji"],
    ["Sardarji", "Sardaarji"],
    [/trois /i, "3 "], // Fixes trois hommes et un couffin
    [/ \(20th$/i, ""],
    [/ \(Re-Re$/i, ""],
    [" S/O ", " son of "], // Fixes Arjun S/O Vyjayanthi
    ["Ep III-", "episode III "],
    // Sanitise use of "PRESENT" which is confused with "X presents"
    ["‘PAST PRESENT FUTURE’ PODCAST", "‘PAST+PRESENT+FUTURE’ PODCAST"],
    ["seventeen [right here]", "seventeen right here"], // remove brackets from this band name
    ["Exclusive Screening of Highly Acclaimed Bengali Feature Film - ", ""],
    ["Mission: Impossible - ", "Mission: Impossible – "],
    ["Festival: Shorts -", "Festival: Shorts –"],
    ["Ori - Rebirth", "Ori: Rebirth"],
    ["Premiere and Networking Event - ", "Premiere and Networking Event: "],
    ["R.S.V.P - ", ""], // Fixes R.S.V.P - Ronde Saare Viah Picho
    ["Member Library Lates: Tom Cruise", "Member Library Lates – Tom Cruise"],
    [/^Short Films\s+-/i, "Short Films:"], // Fixes mismatch on movie called Short Films
    [/^Final Destination.+Double Bill.*$/i, "Double Bill: Final Destination"],
    [
      /Final Destination\s*\+\s*Final Destination.+$/i,
      "Double Bill: Final Destination",
    ],
    [
      /.*Final Destination and Final Destination.+$/i,
      "Double Bill: Final Destination",
    ],
    ["Hidden (Cache)", "Hidden Cache"],
    ["Hidden (Caché)", "Hidden Cache"],
    ["- Special Double Bill", " Special Double Bill"],
    ["Mission: Impossible 8 (", "Mission: Impossible – The Final Reckoning ("],
    ["MI 8: The Final Reckoning", "Mission: Impossible – The Final Reckoning"],
    ["Children’s Classics on 16mm", "Children’s Classics 16mm"],
    ["[TOWARDS THE LIGHT", "TOWARDS THE LIGHT"],
    // Fixes accidental match on "I Like To Watch", which in this case is a movie marathon
    ["Animus Presents: I Like To Watch", "Animus Magazine – I Like To Watch"],
    ["-Kimetsu no Yaiba-", " Kimetsu no Yaiba "],
    [
      /^Demon Slayer: Mugen Train\s?(?:-|$)/i,
      "Demon Slayer The Movie Mugen Train -",
    ],
    ["OCEAN WITH DAVID ATTENBOROUGH", "David Attenborough: Ocean"],
    [/^Sylvanian Families$/i, "Sylvanian Families The Movie"],
    ["Gravy Train Screening", "Gravy Train Short Film"],
    [
      "African Kung Fu Nazis & African Kung Fu Nazis II",
      "African Kung Fu Nazis and African Kung Fu Nazis II Double Bill",
    ],
    ["Silents Synced - ", "Silents Synced: "],
    [/\s+extended$/i, ""],
    [/ – A Special.*$/i, ""],
    [/(?:\s|^)LOTR(?:\s|:)(?:\s*the\s+)?/i, "The Lord of the Rings: The "],
  ];

  corrections.forEach(([phrase, replacement]) => {
    title = title.replace(
      typeof phrase === "string" ? phrase.toLowerCase() : phrase,
      replacement.toLowerCase(),
    );
  });

  // Doctor Who 2025 finale specific match
  if (
    title.startsWith("doctor who") &&
    (title.includes("two episode finale") ||
      title.includes("two-episode finale") ||
      title.includes("two episode season finale") ||
      title.includes("two-episode season finale") ||
      title.includes("2025 finale") ||
      title.includes("wish world"))
  ) {
    return "doctor who wish world the reality war";
  }

  const hasPresents = title.match(/\s+presents?:?\s+(.*?)$/i);
  if (hasPresents) {
    title = hasPresents[1];
  }

  const hasPresented = title.match(/^(.*?)\s+presented\s+/i);
  if (hasPresented) {
    title = hasPresented[1];
  }

  const hasPremiere = title.match(/(?:^|\s+)premiere(?:\s+of|:|;)\s+(.*?)$/i);
  if (hasPremiere) {
    title = hasPremiere[1];
  }

  const hasScreenings = title.match(/\s+screenings?(?:\s+of|:|;)\s+(.*?)$/i);
  if (hasScreenings) {
    title = hasScreenings[1];
  }

  const hasRetrospectiveScreening = title.match(
    /\s+retrospective screening(?:\s+of|:|;)?\s+(.*?)$/i,
  );
  if (hasRetrospectiveScreening) {
    title = hasRetrospectiveScreening[1];
  }

  const hasSelects = matchesOpenPrefix(title, "selects");
  if (hasSelects) {
    title = hasSelects[1];
  }

  const hasClub = matchesOpenPrefix(title, "club");
  if (hasClub) {
    title = hasClub[1];
  }

  const hasScreen = matchesOpenPrefix(title, "on screen");
  if (hasScreen) {
    title = hasScreen[1];
  }

  const hasTalk = matchesOpenPrefix(title, "talk");
  if (hasTalk) {
    title = hasTalk[1];
  }

  const hasNight = matchesOpenPrefix(title, "night");
  if (hasNight) {
    title = hasNight[1];
  }

  const hasFestival = matchesOpenPrefix(title, "festival");
  if (hasFestival) {
    title = hasFestival[1];
  }

  const hasGala = matchesOpenPrefix(title, "gala");
  if (hasGala) {
    title = hasGala[1];
  }

  const hasSpecial = matchesOpenPrefix(title, "special");
  if (hasSpecial) {
    title = hasSpecial[1];
  }

  const hasPreview = matchesOpenPrefix(title, "previews?");
  if (hasPreview) {
    title = hasPreview[1];
  }

  const hasMatinee = matchesOpenPrefix(title, "matinee");
  if (hasMatinee) {
    title = hasMatinee[1];
  }

  const hasSeason = matchesOpenPrefix(title, "season");
  if (hasSeason) {
    title = hasSeason[1];
  }

  const hasFilm = matchesStartingPrefix(title, "film");
  if (hasFilm) {
    title = hasFilm[1];
  }

  const hasThrowback = matchesStartingPrefix(title, "throwback");
  if (hasThrowback) {
    title = hasThrowback[1];
  }

  const hasMember = matchesStartingPrefix(title, "member\\s+[^:;]+");
  if (hasMember) {
    title = hasMember[1];
  }

  const hasFundraiser = matchesStartingPrefix(title, "fundraiser");
  if (hasFundraiser) {
    title = hasFundraiser[1];
  }

  const hasSeparator = title.match(/^(.*?)\s+(?:\+|-|\/|\||•)\s*/);
  if (hasSeparator) {
    title = hasSeparator[1];
  }

  title = title.split(/ plus q(?:&|\+)a/i)[0];
  title = title.split(/ followed by q(?:&|\+)a/i)[0];

  const hasSquareBracketDate = title.trim().match(/^(.*?)\[(\d{4})\](.*?)$/);
  if (hasSquareBracketDate) {
    title = `${hasSquareBracketDate[1]}(${hasSquareBracketDate[2]})${hasSquareBracketDate[3]}`;
  }

  const hasBrackets = title.match(/^(.*?)\s+\[/);
  if (hasBrackets) {
    title = hasBrackets[1];
  }

  const hasSlavicPremier = title.match(/Кинопремиера на "([^"]+)" /i);
  if (hasSlavicPremier) {
    title = hasSlavicPremier[1];
  }

  const hasFrenchShowing = title.match(/projection de «([^»]+)»/i);
  if (hasFrenchShowing) {
    title = hasFrenchShowing[1];
  }

  const hasUkranianFilm = title.match(/Ukrainian Film "([^"]+)" /i);
  if (hasUkranianFilm) {
    title = hasUkranianFilm[1];
  }

  title = title.replace(
    /(^|\s+)\d+th ann(iversary)?( screenings?)?( edition)?(\s+|$)/i,
    " ",
  );

  knownRemovablePhrases.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  const hasYear = title.trim().match(/\(\d{4}\)$/);
  const hasEpisodeList = title.trim().match(/\(episodes[^(]*\)$/i);
  if (!hasYear && !hasEpisodeList) {
    title = title.replace(/\([^(]*\)$/, "").trim();
    title = title.replace(/\([^(]*\)$/, "").trim(); // Do it twice in case there's more paraenthesis
  }

  // Remove tagline which may be added between "..."
  // e.g. "Sachein ... The Miracle Of Love ..."
  title = title
    .trim()
    .replace(/\.\.\.[^.]+\.\.\.$/, "")
    .trim();

  title = title.replace(/\s+screening$/i, "");
  title = title.replace(/^relaxed /i, "");

  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*:\s+/g, ": ")
    .replace(/\s+and\s+/gi, " ")
    .replace(/(?:\s+|^)&\s+/gi, " ")
    .replace(/:$/, "")
    .replace(/'|`|\u200B|‘|’|"|“|”|²|®|,|/g, "")
    .replace(/\s+(-|–)(\s|$)/g, " ")
    .replace(/(\s|^)(-|–)\s+/g, " ")
    .replace(/(-|–|\()$/g, "")
    .replace(/!|:|\.|\*|…|—|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(.+),\s+the$/, "the $1")
    .trim()
    .replace(/^the /i, "")
    .replace(/([a-z])-([a-z])/gi, "$1$2")
    .replace(/\s+q&a$/i, "")
    .replace(/\([^)]+$/i, "") // Remove stuff in brackets where the last bracket got removed elsehwere (e.g. there was a separator within the brackets)
    .trim();
}

module.exports = normalizeTitle;

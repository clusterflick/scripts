const removeDiacritics = require("diacritics").remove;
const knownRemovablePhrases = require("./known-removable-phrases");
const standardizePrefixingForTheatrePerformances = require("./standardize-prefixing-for-theatre-performances");

const matchesOpenPrefix = (title, phrase) =>
  title.match(new RegExp(`\\s+${phrase}[:;]\\s+(.*?)$`, "i"));

const matchesStartingPrefix = (title, phrase) =>
  title.match(new RegExp(`(?:^|\\s+)${phrase}[:;]\\s+(.*?)$`, "i"));

function normalizeTitle(title, options) {
  // Remove any odd whitespace including non-breaking spaces which could cause matching issues later
  title = title.replace(/\s+/g, " ");
  // Normalise curly/smart apostrophes to straight for consistent phrase matching
  title = title.replace(/[\u2018\u2019]/g, "'");
  // One venue publishes its separator as an underscore, so "NT LIVE_ GOLDEN
  // BOY" never matches the broadcast prefixes spelled with a colon and the
  // same performance arrives under a second name. Put the colon back before
  // the theatre prefixing runs, which is what reads it.
  title = title.replace(/\blive_\s/i, "live: ");
  // One venue prefixes every title with the country code of the listing, and
  // the theatre prefixing anchors on the front of the title, so "gb Met Opera
  // 2026-27: Parsifal" never reaches the opera path and the same broadcast
  // arrives under a second name. The Irish listings carry "ie" the same way,
  // so match the codes the venue uses rather than a string apiece. Drop the
  // prefix before that runs rather than in the corrections below, which are
  // too late to help it.
  title = title.replace(/^(?:gb|ie)\s+/i, "");
  // The opera and ballet prefixing strips a possessive owner off the front of
  // a work, so that "Puccini's Turandot" reaches TheMovieDB's "Turandot". It
  // reads the apostrophe to find one, which catches a work that owns its own:
  // "Alice's Adventures in Wonderland" arrives as "Adventures in Wonderland".
  //
  // Take the apostrophe out instead of putting one in. Both spellings then
  // survive the chomp and the ballet keeps its name, which is a better
  // grouping key than the three words it would otherwise share with anything
  // else set in Wonderland. It also settles a phrasing that the chomp misses
  // anyway - "RBO 2026-27: The Royal Ballet - Alice's Adventures In
  // Wonderland" puts the possessive too far from the colon to be seen - so
  // every spelling of this ballet lands on one key rather than two.
  //
  // Before the prefixing rather than in the corrections below, which run too
  // late, the same reason the country-code prefix is handled up here.
  title = title.replace(/\bAlice['’]s(?=\s+Adventures\b)/i, "Alices");

  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  // Keep a copy after basic processing in case we need a different return value
  const backReturnTitle = title;

  // Specific corrections
  const corrections = [
    ["&amp;", "&"],
    [/^Screening Documentary/i, ""],
    ["HANNAH MONTANA: THE MOVIE", "HANNAH MONTANA MOVIE"],
    [/F1\s?®?:? The Movie/i, "F1"],
    [/Batman\s?:? The Movie/i, "Batman"],
    ["The Transformers: The Movie", "The Transformers The Movie ()"], // Retain "The Movie" suffix
    // The subtitle is part of the film's own title, so the brackets come off
    // before the trailing-parenthesis rule gets to strip them with it.
    [
      "Birdman or (The Unexpected Virtue of Ignorance)",
      "Birdman or The Unexpected Virtue of Ignorance",
    ],
    [/:? The Movie$/i, ""],
    // Venues spell the stage-production suffix with a dash or a colon, so
    // match the separator rather than carrying a phrase per spelling.
    [/\s*(?:[-–]\s*)?:?\s*The Play\.?\s*$/i, ""],
    // Only a title that ends on the label is a marathon of the films named
    // before it; "The Hunger Games: Marathon Screening" is its own event and
    // keeps the word, so anchor rather than carry ": Marathon" as a phrase.
    [/:\s*Marathon$/i, ""],
    // The venue asterisks out the profanity in the title, so the film arrives
    // under a name no review site or database spells that way.
    ["F*RS", "FUCKERS"],
    ["The Fishermen", "The Fisherman"], // NOTE: This can be removed in the future once this specific misname has been removed
    ["ESCAPES_ ", "Escapes: "],
    [/\bscreenin:/i, "screening:"],
    // One venue bills the tour without the dash before the subtitle, so the
    // suffix-stripping that leaves every other listing as "neo city seoul"
    // never fires and the same show arrives under a second name.
    ["NEO CITY : SEOUL THE REDLINE", "NEO CITY : SEOUL - THE REDLINE"],
    // One venue drops the strand from the title, so the same late screening
    // arrives under a second name. Anchored because the listings that do carry
    // the strand must not have it prefixed a second time.
    [/^WET & MESSY$/i, "VHS Late Tapes: WET & MESSY"],
    // FrightFest bills one of its two screenings with the wrong subtitle, so
    // the same film arrives under two names and only the other one matches.
    // NOTE: This can be removed once the misnamed screening has passed
    ["Rubberhead: The Life & Times", "Rubberhead: The Life & Monsters"],
    // The shorts programme is billed with a slash where every other listing
    // uses an ampersand, so the same programme arrives under a second name.
    ["Life / Drawing", "Life & Drawing"],
    ["JOY + ", "JOY & "],
    // The Oct 7th Films strand bills its double bill with a plus, which the
    // separator rule reads as a separator and drops the second film at, so the
    // pairing is spelled with an ampersand before that runs.
    ["Yellow Ribbons + ", "Yellow Ribbons & "],
    ["HALT BOOK LAUNCH + ", "HALT BOOK LAUNCH & "],
    ["HERO + My Dad, Guyana and Me", "HERO & My Dad, Guyana and Me"],
    ["Music with Tara Franks + ", "Music with Tara Franks & "],
    ["Storytelling + ", "Storytelling & "],
    ["Life on the Horn (2020) + ", "Life on the Horn (2020) & "],
    ["Back and Forth + ", "Back and Forth & "],
    [" + Cat", " and Cat"],
    [" + Zog", " and Zog"],
    ["Zog + ", "Zog & "],
    [" + Superworm", " and Superworm"],
    // The double bill is billed with and without the definite article, and one
    // venue closes the gap around the separator, so the separator rule would
    // otherwise drop the second film from some of them.
    [/\s*\+\s*(?:The )?Gruffalo's Child/i, " and The Gruffalo's Child"],
    [" + The Scarecrow's Wedding", " and The Scarecrow's Wedding"],
    [" + 28YL: The Bone Temple", " "],
    [" + The Bone Temple (", " "],
    [" + Jackie", " & Jackie"],
    [/\s+[&|+] 28 Years Later: The Bone Temple [-|(]/i, " "],
    [" the bone temple double", " double"],
    [
      /^Taylor Swift The Official Release Party$/i,
      "Taylor Swift The Official Release Party Of A Showgirl",
    ],
    [
      /Taylor Swift (\||\/) (The )?Release /i,
      "Taylor Swift The Official Release ",
    ],
    [/Taylor Swift (\||\/) The /i, "Taylor Swift The "],
    ["Relaxed Screening + Discussion:", "Relaxed Screening & Discussion:"],
    [/^LD:/i, "LD Friendly:"],
    [/^Re-Viewing /i, ""],
    [/housefull 5 (a|b)(\s+|$)/i, "housefull 5 "],
    ["Star Wars Sundays", "Star Wars"],
    // Remove prefix separators which will cause later processing to strip the wrong section
    [/Star Wars: Ep(?:isode)? ([IV]+) - /i, "Star Wars: Episode $1 "], // Remove the dash
    ["Rafadan Tayfa - Kapadokya", "Rafadan Tayfa: Kapadokya"],
    // The restoration is billed with the strand spelled as "<film> - The Madness
    // Film: 4K Restoration". Removed here rather than in the phrase list, which
    // runs after the "film:" prefix rule has already read that colon as a
    // prefix separator and thrown the film title away.
    [/\s*-\s*The Madness Film: 4K Restoration/i, ""],
    // The strand bills every film as "KinoTage: <director> - <movie>", with the
    // separator spelled as a hyphen or an en dash, so the later separator rule
    // would keep the director and drop the film. Strip the director credit here
    // and leave the strand prefix for the phrase list to remove.
    [
      /^KinoTage(?: Opening Screening)?:\s+[^-–:]+\s+[-–]\s+(.+)$/i,
      "KinoTage: $1",
    ],
    ["Reel Talk - ", "Reel Talk: "],
    ["Average Rob -", "Average Rob:"],
    ["Roger Waters -", "Roger Waters:"],
    ["CBeebies Musical - ", "CBeebies Musical: "],
    ["CBeebies - ", "CBeebies: "],
    ["CBeebies Panto 2025", "CBeebies Panto"],
    ["Ex Libris - ", "Ex Libris: "],
    ["Bison - ", "Bison: "],
    ["COLD ISLANDERS - ", "COLD ISLANDERS: "],
    ["Jozef Van Wissem - ", "Jozef Van Wissem: "],
    ["The World of Hans Zimmer-", "The World of Hans Zimmer: "],
    ["The World of Hans Zimmer -", "The World of Hans Zimmer: "],
    [
      "The World of Hans Zimmer: The New Dimension",
      "The World of Hans Zimmer: A New Dimension",
    ],
    [/Luca\s+-\s+Seeing Red/i, "Luca – Seeing Red"],
    ["Chainsaw Man - The Movie:", "Chainsaw Man – The Movie:"],
    ["Antarctica - ", "Antarctica: "],
    ["Rolling Stones - ", "Rolling Stones: "],
    [" - The Musical", ": The Musical"],
    ["Westlife -", "Westlife:"],
    [
      "Westlife: Royal Albert Hall 25th Anniversary Concert",
      "Westlife: Royal Albert Hall",
    ],
    ["Westlife: 25th Anniversary Concert", "Westlife: Royal Albert Hall"],
    ["Modigliani - ", "Modigliani: "],
    [
      "Weeknight Tapes - The Cure - In Orange",
      "Weeknight Tapes: The Cure In Orange",
    ],
    ["Weeknight Tapes - ", "Weeknight Tapes: "],
    [
      "NCT 127 - 'NEO CITY : SEOUL - THE REDLINE",
      "NCT 127: NEO CITY SEOUL THE REDLINE",
    ],
    ["Outdoor Silent Cinema - ", "Outdoor Silent Cinema: "],
    ["Film Africa 2025 -", "Film Africa 2025:"],
    // The premiere bills the Turkish title and its English translation
    // either side of a dash, which hasSeparator reads as a separator and
    // cuts the film off at, leaving the strand rather than the film. Spell
    // it with the colon the prefixes use so the label comes off instead.
    ["İFŞA -", "İFŞA: "],
    ["Preview Screening - ", "Preview Screening: "],
    ["Cinema Film Screening - ", "Cinema Film Screening "],
    ["Cinema Film Screening & Talk - ", "Cinema Film Screening & Talk: "],
    ["Closing Night + Awards", "Closing Night and Awards"],
    ["Poetry Slam", "Event: Poetry Slam"],
    ["Scared To Dance -", "Scared To Dance "],
    // The Manic Street Preachers documentary is billed with dashes between the
    // three parts of its name, which hasSeparator reads as a separator and
    // cuts the title down to its first two words.
    ["Be Pure - Be Vigilant - Behave", "Be Pure Be Vigilant Behave"],
    // The company bills the ballet with and without the definite article, so
    // the two venues showing it would otherwise arrive under different names.
    [
      /^English National Ballet presents:?\s+(?:the\s+)?/i,
      "English National Ballet presents ",
    ],
    ["ODEON Pride Nights - ", "ODEON Pride Nights "],
    ["VIP TV/FILM INDUSTRY SCREENING - ", "VIP TV/FILM INDUSTRY SCREENING: "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["Green Screen -", "Green Screen "],
    [/Film Club\s*\d*\s*-\s*/i, "Film Club: "],
    ["Film Club: Rebels:", "Film Club: "],
    [/^Film\s+- /i, "Film: "],
    [/Film\s+- /i, "Film "],
    ["FREE screening - at ", "FREE screening at "],
    ["FREE Film Screening - ", "Free Film Screening: "],
    [/ - free screening( - \w+)?$/i, ""],
    ["FREE Screening - ", "Free Screening: "],
    ["Crafty Movie Night - ", "Crafty Movie Night: "],
    ["Girlguiding Screening - ", "Girlguiding Screening: "],
    ["SEEN Charity Film Screening - ", "SEEN Charity Film Screening: "],
    ["Romford Horror Festival - ", "Romford Horror Festival: "],
    ["Film Screening - ", "Film Screening: "],
    ["Limited Run - ", "Limited Run: "],
    ["Community Cinema Screening - ", "Community Cinema Screening: "],
    [/^SILVER\s*?SCREEN -/i, "SILVER SCREEN"],
    ["SUBTITLED -", "SUBTITLED "],
    [/^RELAXED -/i, "Relaxed screening: "],
    ["RELAXED Disney's", "Relaxed screening: Disney's"],
    ["Mamma Mia-", "Mamma Mia -"],
    ["CELLULOID JAM! –", "CELLULOID JAM! "],
    ["Saturday night at the movies -", "Saturday night at the movies:"],
    ["Pierre Boulez - Boulez", "Pierre Boulez "],
    ["twin peaks - ", "twin peaks "],
    // TheMovieDB numbers the trilogy's instalments with Roman numerals and a
    // colon ("The Human Condition I: No Greater Love"), where the venue bills
    // the part and the subtitle as two dashed clauses. Anchored to the film,
    // because a double bill that names a "Part 1" in its second half is not
    // this trilogy and must keep the numeral it was billed with.
    [/^The Human Condition - Part 1 - /i, "The Human Condition I: "],
    ["- Part ", "Part "],
    // The double bill is billed with a plus, which the separator rule would
    // otherwise read as the end of the title, dropping the second film. Named
    // as the pairing rather than the prefix alone, because the same venue also
    // bills "American History X + Intro By Tony Kaye", where what follows the
    // plus is the billing and the rule that drops it is the right one.
    [
      "American History X + Humpty Dumpty X",
      "American History X & Humpty Dumpty X",
    ],
    ["FUN IN THE LOUNGE - ", "Fun in the lounge: "],
    ["FUN AT THE LOUNGE - ", "Fun in the lounge: "],
    ["FREE ENTRY - ", "Free Entry: "],
    ["- FREE ENTRY", "FREE ENTRY"],
    ["Tour-Live", "Tour - Live"],
    ["- Live From", "Live From"],
    ["- From", "Live From"],
    ["- National Theatre", "National Theatre"],
    ["- Year of the Rabbit", "Year of the Rabbit"],
    ["- Live Arena Tour", "Live Arena Tour"],
    ["- Drunken Scorpion Presents ", "- Drunken Scorpion "],
    [/^Baby\s*?\+\s*?1:?\s*/i, "Baby & 1 "],
    ["friends + crew", "friends & crew"],
    ["Trans + Pride:", "Trans Pride:"],
    [" + Short Film: ", " + Short Film "],
    ["- Celebrating", " - Celebrating"],
    ["- Classics", " - Classics"],
    ["- Pride", " - Pride"],
    ["- International", " - International"],
    ["Björk's", "Björk"],
    ["Funny Games / Funny Games US", "Funny Games Double Bill"],
    ["The Tou 3D", "The Tour 3D"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["The Return The Return", "The Return"],
    // Documentary is released as "Knife: The Attempted Murder of Salman Rushdie"
    [
      /(?:Knife: )?The Attempted Murder of Salman Rushdie/i,
      "Knife: The Attempted Murder of Salman Rushdie",
    ],
    // One venue bills the same documentary by its first word alone, so
    // "Knife + Recorded Q+A" loses the billing at the separator and groups with
    // every other one-word "knife". Anchored, and requiring the separator, so a
    // film actually named "Knife" is left alone.
    [/^Knife \+ /i, "Knife: The Attempted Murder of Salman Rushdie + "],
    ["Wildnerness", "Wilderness"],
    [/\s+dub?$/i, ""], // Dubbed
    [/\s+sub?$/i, ""], // subbed
    [/\s+(?:live\s+)?(?:in\s+)?(3|2)d$/i, ""], // 3d or 2d, with optional "live in" prefix
    [/\s+2026$/i, ""], // Year
    ["Vasthunnam", "Vasthunam"],
    // TheMovieDB drops an "i" from the film's title, which the venues and IMDb
    // both spell in full, and its search finds nothing under the full spelling
    // - so the venue's title is corrected to TheMovieDB's.
    // NOTE: This must be removed once TheMovieDB fixes the entry, as searching
    // the misspelling will then stop finding it
    // https://www.themoviedb.org/movie/1544847
    ["Pradhama Drishtiya Kuttakkar", "Pradhama Drishtya Kuttakkar"],
    ["Melagaon", "Malegaon"],
    ["Chadian", "Chadum"],
    ["Carvaggio", "Caravaggio"],
    ["Seigfried", "Siegfried"],
    ["Acroyd", "Ackroyd"],
    ["Possun Trot", "Possum Trot"],
    ["in Harlen", "in Harlem"],
    [
      "Safflicks Film Festival: Where We Belong",
      "Safflicks Film Festival: Where We Belong: Double Bill",
    ],
    ["10180", "1080"],
    ["unknwon", "unknown"],
    ["colourful", "colorful"],
    ["theater", "theatre"],
    ["Shanthamee Reethriyil", "Shanthamee Raathriyil"],
    ["Shanthamee Rathriyil", "Shanthamee Raathriyil"],
    ["Aabhyanthara Kuttavvali", "Aabhyanthara Kuttavaali"],
    ["Daakuaan Da Munda", "Dakuaan Da Munda"],
    ["Vysanasametham Bandhumithradhikal", "Vyasanasametham Bandhumithradhikal"],
    [
      "Vyasana Sametham Bandhu Mithradhikal",
      "Vyasanasametham Bandhumithradhikal",
    ],
    ["Mana Shankara Varaprasad Garu", "Mana ShankaraVaraprasad Garu"],
    ["Vrushabha", "Vrusshabha"],
    [/Anaganaga Oka Raj(?:$|\s+)/i, "Anaganaga Oka Raju"],
    ["Wignyapthi", "Wignyapathi"],
    ["Mahasayulaki", "Mahasayulaku"],
    ["Lagan Laagi Re", "Lagan Laagii Re"],
    ["Vidhaata", "Viddhaata"],
    ["Badhu Alright che", "Badhu Alright chhe"],
    ["Maa Inti Bangaaram", "Maa Inti Bangaram"],
    ["Main Vaapas Aunga", "Main Vaapas Aaunga"],
    ["Frozen 2", "Frozen II"],
    ["Terminator 2 Live", " Terminator 2"],
    [/\s+terminator 2($| \()/i, " Terminator 2 Judgment Day$1"],
    [
      "Indiana Jones and the Raiders Of The Lost Ark",
      "Raiders Of The Lost Ark ",
    ],
    [/^Relaxed Mufasa/i, "Relaxed screening: Mufasa"],
    ["behaviour", "behavior"],
    ["Lynch: Fire Walk With Me", "Lynch: Twin Peaks Fire Walk With Me"],
    ["War Paint: Woman at War", "War Paint: Women at War"],
    ["Big Night Out: New Moon", "Big Night Out: The Twilight Saga: New Moon"],
    ["The Twilight Saga: Twilight", "Twilight"],
    ["David Lynch: The Short Films", "The Short Films of David Lynch"],
    ["Battleground + intro ", "Battlefield + intro "], // BFI gets the name of the movie wrong
    ["The Dawn of Impressionism", "Dawn of Impressionism"],
    [/ - Paris,? 1874/i, ": Paris 1874"],
    [" - Poets and Lovers", ": Poets and Lovers"],
    [/Last Supper (– )?Part 1/i, "Last Supper"],
    ["The Last Supper", "Last Supper"],
    ["Veera Dheera Sooran: Part 2", "Veera Dheera Sooran"],
    // The two-part documentary is billed with the instalment in front of the
    // subtitle, spelled with brackets or a colon, with or without a space
    // around the dash, and with the number spelled out as a word, so the same
    // film arrives under a name per spelling. One pattern rather than a string
    // per spelling, and here rather than in the phrase list, which the
    // separator rule beats to "De Gaulle: Part 2".
    [
      /^de gaulle\s*:?\s*\(?part (?:\d+|one|two)\)?\s*[-–:]?\s*/i,
      "De Gaulle: ",
    ],
    ["Mulholland Dr.", "Mulholland Drive"], // Otherwise we match the TV pilot of the same name
    ["W&G:", "Wallace & Gromit:"],
    [
      /(?<!\bThe\s)Curse of the Were[-\s]Rabbit/i,
      "The Curse Of The Were-Rabbit",
    ],
    [/(?<!\bThe\s)Wrong Trousers/i, "The Wrong Trousers"],
    [/Wallace & Gromit:(.*)\//i, "Wallace & Gromit:$1 "], // Remove slash
    ["14 Days (Girlfriend Intlo)", "14 Days Girlfriend Intlo"],
    ["SCSEVENTEEN", "SEVENTEEN"],
    ["Björk's", "Björk:"],
    ["Presents: Children's Cinema", "Presents: The Notebook Children's Cinema"], // Stop this accidentally matching "Children in the Cinema"
    ["Eurovision Grand Final Live", "Eurovision Grand Final"], // Remove live for better combining
    [
      "Films That Fuck",
      "Films That Fuck: Re-uses of Pornography in Moving Image Practices During the HIV/AIDS Crisis and the Present",
    ],
    [
      "Films that F*ck 2: Californian Gay Pornotragedies",
      "Victim of Circumstance",
    ],
    ["End of Evangelion : Double Feature", "End of Evangelion"],
    ["(True True)", "(True)²"], // Fix for Evangelion: Death (True)²
    ["3.0+1.01", "3.0+1.0"], // Fix for Evangelion: 3.0+1.0 Thrice Upon a Time to combine with updated version release
    [
      /^The End of Evangelion$/i,
      "Neon Genesis Evangelion: The End of Evangelion",
    ],
    [
      "Evangelion: Death (True)² + The End of Evangelion",
      "Neon Genesis Evangelion: Death (True)² & The End of Evangelion",
    ],
    ["We Live Here + Chornobyl 22", "We Live Here & Chornobyl 22"],
    ["Terror Dome", "Terrordome"],
    ["Wu Viet", "Woo Viet"],
    ["The Adventures of Tintin: ", "Tintin and "],
    [
      "Dangerous Encounters: 1st Kind",
      "Dangerous Encounters of the First Kind",
    ],
    ["Where Is the Friend's Home?", "Where Is the Friend's House?"],
    ["Ghidrah", "Ghidorah"], // Fix for Ghidorah, the Three-Headed Monster
    ["100 Sunsets", "100 Sunset"], // https://www.themoviedb.org/movie/1511781-100-sunset
    ["½", " 1/2"],
    [/Mr\.? Hulot/i, "Monsieur Hulot"], // Fix for Monsieur Hulot's Holiday
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
      "Bluey at the Cinema: Let's Play Chef Collection",
    ],
    [": Let's Chef Collection", " Let's Play Chef Collection"],
    [": Chef Collection", " Let's Play Chef Collection"],
    ["the cinema show", "cinema show"],
    ["Maastricht:", "Maastricht Concert:"],
    ["Sardaar Ji", "Sardaarji"],
    ["Sardar Ji", "Sardaarji"],
    ["Sardarji", "Sardaarji"],
    ["DE DE PYAR DE 2", "DE DE PYAAR DE 2"],
    ["En Ghabl El Kot", "En Ghab El Kot"],
    [/trois /i, "3 "], // Fixes trois hommes et un couffin
    [/ \(20th$/i, ""],
    [/ \(Re-Re$/i, ""],
    [" S/O ", " son of "], // Fixes Arjun S/O Vyjayanthi
    ["Ep III-", "episode III "],
    // Sanitise use of "PRESENT" which is confused with "X presents"
    ["'PAST PRESENT FUTURE' PODCAST", "'PAST+PRESENT+FUTURE' PODCAST"],
    ["Past Present Future Podcast", "Past+Present+Future Podcast"],
    ["seventeen [right here]", "seventeen right here"], // remove brackets from this band name
    ["Festival: Shorts -", "Festival: Shorts –"],
    [/^UK Asian Film Festival\s+/i, "UK Asian Film Festival: "],
    ["Ori - Rebirth", "Ori: Rebirth"],
    // The sequel is billed with a dash before its subtitle, which the
    // separator rule reads as a separator and cuts the title down to
    // "Exorcist II".
    ["Exorcist II - ", "Exorcist II: "],
    ["Premiere and Networking Event - ", "Premiere and Networking Event: "],
    ["R.S.V.P - ", ""], // Fixes R.S.V.P - Ronde Saare Viah Picho
    ["Member Library Lates: Tom Cruise", "Member Library Lates – Tom Cruise"],
    [/^Short Films\s+-/i, "Short Films:"], // Fixes mismatch on movie called Short Films
    [/^Short Film Screening and /i, "Short Film and "],
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
    ["Mission: Impossible - ", "Mission: Impossible – "],
    ["Mission: Impossible 8 (", "Mission: Impossible – The Final Reckoning ("],
    ["Mission: Impossible 2", "Mission: Impossible II"],
    ["MI 8: The Final Reckoning", "Mission: Impossible – The Final Reckoning"],
    ["M:I Season - ", "M:I Season: "],
    [/M:I Season: (?!Mission)/i, "M:I Season: Mission: Impossible – "],
    [/Dead Reckoning$/i, "Dead Reckoning Part One"],
    [/Dead Reckoning (?!Part)/i, "Dead Reckoning Part One "],
    ["Children's Classics on 16mm", "Children's Classics 16mm"],
    ["[TOWARDS THE LIGHT", "TOWARDS THE LIGHT"],
    // Fixes accidental match on "I Like To Watch", which in this case is a movie marathon
    ["Animus Presents: I Like To Watch", "Animus Magazine – I Like To Watch"],
    ["-Kimetsu no Yaiba-", " Kimetsu no Yaiba "],
    [
      /^Demon Slayer: Mugen Train\s?(?:-|$)/i,
      "Demon Slayer The Movie Mugen Train -",
    ],
    ["Demon Slayer-Infinity Castle", "Demon Slayer Infinity Castle"],
    ["Demon Slayer: The Movie -", "Demon Slayer "],
    ["OCEAN: DAVID ATTENBOROUGH", "OCEAN WITH DAVID ATTENBOROUGH"],
    ["OCEAN WITH DAVID ATTENBOROUGH", "David Attenborough: Ocean"],
    [/(^|\s)Sylvanian Families$/i, " Sylvanian Families The Movie"],
    ["Gravy Train Screening", "Gravy Train Short Film"],
    [
      "African Kung Fu Nazis & African Kung Fu Nazis II",
      "African Kung Fu Nazis and African Kung Fu Nazis II Double Bill",
    ],
    ["Silents Synced - ", "Silents Synced: "],
    ["Gama Bomb - ", "Gama Bomb: "],
    ["STRANGE JOURNEY - ", "STRANGE JOURNEY: "],
    [/\s+extended$/i, ""],
    [/ – A Special.*$/i, ""],
    [/(?:\s|^)LOTR(?:\s|:)(?:\s*the\s+)?/i, "The Lord of the Rings: The "],
    [/Lord of the Rings -/i, "Lord of the Rings: "],
    [
      "Lord of the Rings: Return of the King",
      "Lord of the Rings: The Return of the King",
    ],
    ["Doctor Who: Projections in Time -", "Doctor Who: "], // Remove unnecessary "Projections in Time" prefix
    ["H I / P D", "Hidden Inventory/Premature Death"], // Fixes Jujutsu Kaisen: H I / P D
    [
      "Modigliani: Three Days on the Wings of Madness",
      "Modì: Three Days on the Wing of Madness",
    ],
    ["X-Men 2", "X2"], // The title of the second X-men movie is X2
    ["The Rise and Fall of The Clash Redux", "The Rise and Fall of The Clash"],
    [/\(?with subtitles for.*$/i, ""],
    [/ a$/i, ""], // Remove strange trailing "A"
    ["Extended Trilogy", "Trilogy"],
    ["Oslo Stories Trilogy:", "Oslo Stories:"],
    [
      /^The Invisible Doctrine /i,
      "The Invisible Doctrine: The Secret History of Neoliberalism ",
    ],
    ["The Fantastic Four: First Steps", "The Fantastic 4: First Steps"],
    ["Bluebeard's Eighth Wife", "Bluebeard's 8th Wife"],
    ["Pip and Posy's", "Pip and Posy"],
    ["10 + 10", "10 plus 10"],
    ["Super Connected Live", "Super Connected"],
    [/wall\s*[-•]\s*e/i, "WALL·E"],
    ["Die Hard 2: Die Harder", "Die Hard 2"],
    ["PRINCE - SIGN O'THE TIMES", "PRINCE: SIGN O THE TIMES"],
    [" 2.1 ", " 2 "],
    ["Disney Junior Cinema Club 2025", "Disney Junior Cinema Club"],
    ["Disney Junior Club 2025", "Disney Junior Cinema Club"],
    ["Downtown Abbey", "Downton Abbey"],
    [
      "Reality Is Not Enough: Irvine Welsh",
      "Irvine Welsh: Reality Is Not Enough",
    ],
    ["Dora the Explorer", "Dora"],
    [/Dora:? Magic Mermaid Adventures/i, "Dora: Mermaid Adventures"],
    ["Dora's Magical Mermaid Adventures", "Dora: Mermaid Adventures"],
    ["LEGACY AFRICA FILM", "Legacy Africa "],
    [/Kantara:? A Legend/i, "Kantara"],
    [" - Chapter ", ": Chapter "],
    [" - Live on Stage", ": Live on Stage"],
    [" - A Sneak Peek", ": A Sneak Peek"],
    [
      /Royal Ballet & Opera \d{4}: La Sonnambula/i,
      "The Metropolitan Opera: La Sonnambula",
    ],
    [
      /Royal Ballet & Opera \d{4}: Eugene Onegin/i,
      "The Metropolitan Opera: Eugene Onegin",
    ],
    ["Worlds25 - Finals in Cinema", "World Finals 2025"],
    ["Love + War", "Love+War"],
    ["Neighbour Totoro", "Neighbor Totoro"],
    // One venue bills the film without the article, so it never groups with
    // the listings using the full title.
    ["Harry Potter & Chamber", "Harry Potter & The Chamber"],
    ["The Extra Terrestrial", "The Extra-Terrestrial"],
    [/^E\.T\.$/i, "E.T. the Extra-Terrestrial"],
    // Work around a weird issue with the moviedb API and a soft hyphen in the listing title
    [/Tales from the Mag(\u00AD)?ic Garden/i, "Tales from the Garden"],
    [" – Q&A with ", " + Q&A with "],
    ["Homosexual –", "Homosexual ("],
    ["Stendalì: Still They Toll + ", ""],
    ["Mockingjay Pt ", "Mockingjay Part "], // Un-abbreviate for the rule below
    [/\s+Part\s+(\d+)(\s|:|$)/i, " $1$2"],
    ["Nanny Rosa film", "Nanny Rosa"],
    ["Bāhubali", "Baahubali"],
    ["Khatarnaak", "Khatarnak"],
    [/Krishnavatar[\s$]/i, "Krishnavataram"],
    ["Thalaimayil", "Thalaimaiyil "],
    ["Bhoot Bangla", "Bhooth Bangla"],
    [/^En Ghab El Kot /i, "If the Cat is Absent"],
    ["MEMBERS ONLY: Pumpkin Carving", "Members only pumpkin carving"],
    ["MEMBERS ONLY PREVIEW -", "MEMBERS ONLY PREVIEW: "],
    [
      "Two Strangers Who Try Not to Kill Eachother",
      "Two Strangers Trying Not To Kill Each Other",
    ],
    [/ for Palestine$/i, ""],
    ["Interstellar Live", "Interstellar"],
    ["Brassed Off Live", "Brassed Off"],
    ["High School Musical Movie", "High School Musical"],
    ["Sex Dla Opornych", "Seks dla opornych"],
    ["TO CATCH A THEIF", "To Catch a Thief"],
    ["Breakaway Day & Metamorph", "Double Bill"],
    [/\(Double(-|\s)?Bill\)/i, " Double Bill "],
    [/Double(-|\s)?Bill/i, "Double Bill"],
    [/-? Double Feature/i, " Double Bill "],
    [/Wicked [+|/] Wicked[:]? For Good/i, "Wicked & Wicked: For Good"],
    [/Wicked:? Double Bill/i, "Wicked & Wicked: For Good Double Bill"],
    [/The God Father/i, "The Godfather"],
    ["Le Litre de lait + Les Contrebandières", "Les Contrebandières"],
    ["CHRISTOPHER BRETT BAILEY + ", "CHRISTOPHER BRETT BAILEY presents "],
    ["ELF MOVIE", "Elf"],
    ["Screening + Q&A:", "Screening & Q&A:"],
    ["Marcin Wierzchowski - ", "Marcin Wierzchowski: "],
    [
      "Sapphic Cinema and BFI Melodrama -",
      "Sapphic Cinema and BFI Melodrama: ",
    ],
    ["Sapphic Cinema - ", "Sapphic Cinema: "],
    ["Pride Special - ", "Pride Special: "],
    ["Cinema Club - ", "Cinema Club: "],
    ["Suicide Prevention Short Film Premiere", "Suicide Prevention"],
    ["Film Premiere - ", "Film Premiere: "],
    ["Karaoke, crafts + ", "Karaoke, crafts & "],
    ["FOLIES MEURTRIÈRES + ", "FOLIES MEURTRIÈRES & "],
    [/^(.+)- National Theatre Live$/i, "National Theatre Live: $1"],
    [
      "National Theatre Live: Playboy of the Western World",
      "National Theatre Live: The Playboy of the Western World",
    ],
    [
      "MUPPET PUPPETS CHRISTMAS CAROL WORKSHOP & SING-ALONG",
      "Muppet Christmas Carol",
    ],
    // The craft session billed after the sing-along is written with either
    // spelling of the conjunction ("Sing-a-long & Pirate Hat Making Workshop",
    // "SING-ALONG SCREENING AND PIRATE HAT MAKING WORKSHOP"), so one pattern
    // rather than a string per spelling.
    [/\s*(?:&|and)\s+pirate hat making workshop/i, ""],
    ["Film Club |", "Film Club: "],
    ["地道星期日影院 |", "地道星期日影院: "],
    ["IN-HOUSE - ", "IN-HOUSE: "],
    ["RIO FOREVER /", "RIO FOREVER: "],
    [/^Rio - /i, ""],
    ["BAR TRASH - ", "BAR TRASH: "],
    [
      "BAR TRASH Positive East Fundraiser /",
      "BAR TRASH Positive East Fundraiser: ",
    ],
    ["Bar Trash: Queer Horror / ", "Bar Trash: Queer Horror & "],
    ["Bar Trash: Silent Horror / ", "Bar Trash: Silent Horror & "],
    [/^BAR TRASH: (.+) \+ (.+)$/i, "BAR TRASH: $1 & $2"],
    ["Final Shows - ", "Final Shows: "],
    ["Guest Event - ", "Guest Event: "],
    ["Throwback - ", "Throwback: "],
    ["Toddler - ", "Toddler: "],
    ["Popcorn Nights - ", "Popcorn Nights: "],
    [
      /Tony Palmer film Story of Popular Music/i,
      "All You Need Is Love: The Story of Popular Music",
    ],
    ["Goethe Annual Lecture 2025 - ", "Goethe Annual Lecture 2025: "],
    [
      /Goethe-Kino\s?-\s?Mascha Schilinski - /i,
      "Goethe-Kino & Mascha Schilinski: ",
    ],
    [
      /Goethe-Kino\s?-\s?Melanie Liebheit, Gereon Wetzel:/i,
      "Goethe-Kino & Melanie Liebheit, Gereon Wetzel:",
    ],
    ["James Acaster - ", "James Acaster: "],
    ["Black Friday - ", "Black Friday: "],
    ["IMAX exclusive preview - ", "IMAX exclusive preview: "],
    [
      /All Out of Bubblegum Film Club \d+ \//i,
      "All Out of Bubblegum Film Club: ",
    ],
    ["PREMIERE: SURFILMUSIC", "PREMIERE: Jack Johnson: SURFILMUSIC"],
    [/^Watch (.+) with RKG & Friends$/i, "$1"],
    ["EXPOSED aka EXPONERAD", "EXPONERAD"],
    ["THE SEDUCERS AKA TOP SECRET", "THE SEDUCERS"],
    ["Song O Chyabrung", "Song Of Chyabrung"],
    // The documentary is billed by its short name alongside the Q&A that
    // follows it, which groups it apart from the full title the same film
    // screens under elsewhere. Guarded so the full title is left alone.
    [/steal this story(?!,? please)/i, "Steal This Story, Please"],
    [
      /Marcel,? Santa and the Little Pizza Delivery Man/i,
      "Marcel, Father Christmas and the Little Pizza Delivery Boy",
    ],
    ["Migrant Cinema - ", "Migrant Cinema: "],
    ["muppets christmas carol", "muppet christmas carol"],
    [
      /^(?:(.*?\b(?:screening|day))\s*:?\s+)?Dr\.? Strangelove$/i,
      "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    ],
    ["Prime Minster", "Prime Minister"],
    [/Akhanda 2(\s+\(Telugu\))?$/i, "Akhanda 2: Thaandavam"],
    ["LES LIAISONS DANSEREUSES", "LES LIAISONS DANGEREUSES"],
    ["Les Liasions Dangereuses", "Les Liaisons Dangereuses"],
    ["Search4Square", "Search for SquarePants"],
    [
      /Snakes and Ladders: Childish Actions/i,
      "Snakes and Ladders 2: Children's Games",
    ],
    [/Ella Mc Cay/i, "Ella McCay"],
    ["Superman 2025", "Superman (2025)"],
    // The anniversary strand names the year without brackets, so the year is
    // read as part of the title and the same film arrives under a second name.
    ["Perks Of Being A Wallflower 2012", "Perks Of Being A Wallflower (2012)"],
    ["A Minecraft Movie Premiere", "A Minecraft Movie"],
    // The screening is billed around the book being launched alongside it, but
    // the film shown is the film of the book. Only this title: a book launch
    // is an event in its own right elsewhere on the listings.
    ["Morvern Callar Book Launch", "Morvern Callar"],
    // The anniversary strand names the years since release after the title, so
    // the film arrives under a name it only has in this one season.
    ["Pressure at 50", "Pressure"],
    ["Evgenij Onegin", "Eugene Onegin"],
    ["NOVELLE VAGUE", "NOUVELLE VAGUE"],
    // One venue misspells the play in its broadcast listing, so the same
    // National Theatre Live performance arrives under a second name.
    ["GOLDERN BOY", "GOLDEN BOY"],
    // JOIA spells the 1994 film with Santa's surname rather than the clause
    // the film turns on, but only on the tickets that come with dinner - its
    // own screening tickets spell it right - so the same film arrives under a
    // second name. Matched together with that dinner billing, which is JOIA's
    // alone: "The Santa Claus" on its own is another venue's listing, and
    // correcting every venue's spelling from here would reach the films that
    // really are about Santa Claus.
    [/The Santa Claus(?=\s*-\s*DINNER IN TOZI)/i, "The Santa Clause"],
    // The same venue bills the 2000 film the way the rhyme runs rather than
    // the way it is titled, so it arrives under a second name. Corrected for
    // every venue rather than for JOIA alone, because no film is called this:
    // whoever writes it means "How The Grinch Stole Christmas". The "how" is
    // optional in the match so a listing that already carries one is not left
    // with two.
    [
      /(?:How )?The Grinch Who Stole Christmas/i,
      "How The Grinch Stole Christmas",
    ],
    [/^David Bowie:? The Final Act/i, "Bowie: The Final Act"],
    [/JEFF BUCKLEY - IT'S NEVER OVER/i, "It's Never Over, Jeff Buckley"],
    ["Berliner Philharmoniker Live:", "Berliner Philharmoniker:"],
    ["NYE Concert", "New Years Eve Concert"],
    ["Happy Feet 2", "Happy Feet Two"],
    ["And Life Goes On", "Life, and Nothing More…"],
    ["Sumud / Life endures", "Sumud: Life endures"],
    ["Romeo + Juliet", "Romeo+Juliet"],
    ["PEFF26 |", "PEFF26: "],
    [
      /^Buster Keaton's Sherlock Jr\. with R\.E\.M\..*/i,
      "R.E.M x Buster Keaton's Sherlock Jr.",
    ],
    ["Picture East Film Festival 2026 - ", "Picture East Film Festival 2026:"],
    ["Bun Bites Screening - ", "Bun Bites Screening: "],
    ["Romford Horror 2026 -", "Romford Horror 2026:"],
    ["Romford Horror Festival 2026 -", "Romford Horror 2026:"],
    ["Opening Night -", "Opening Night "],
    // The Guild co-presents several festivals and the credit is appended to the
    // festival's own name, so the same festival arrives under two titles. A
    // The year comes off with the credit rather than being left behind: this
    // runs after the trailing year has already been stripped, so taking only
    // the credit leaves "The Hidden Film Festival 2026" still split from the
    // plain billing, which normalises to "hidden film festival".
    [/(\s+\d{4})?:\s*in association with the Film Festival Guild\s*$/i, ""],
    // The Met's anniversary strand is billed four ways - plain, Encore, Live,
    // and with the subtitle spelled out - for what is one celebration. Collapse
    // them onto the fullest form rather than letting the extras split it.
    [
      /^Twenty Years of the Met in Cinemas.*$/i,
      "Twenty Years of the Met: An Anniversary Celebration",
    ],
    // The venue abbreviates the show and then spells it out after a dash, so
    // the dash reads as a subtitle separator and the spelled-out half is
    // dropped, leaving the initials on their own.
    ["L&O - ", "L&O "],
    [/Surprise Film( \d{1,2}\.\d{1,2}\.\d{1,2})?/i, "mystery movie"],
    [/^Secret Film Screenings presents:?\s+.*$/i, "mystery movie"],
    [/(\w+ Film Festival: )?Surprise Screening/i, "mystery movie"],
    [
      /^(free |monthly )?(mystery|surprise) ([\w+]+ )?([\w+]+ )?(night|film|movie|cinema|screening|matinees?|thriller|horror):?( Nov| \d)?/i,
      "mystery movie",
    ],
    // The strand a venue puts the unnamed film in is part of the billing, not
    // a second film - "Late Night Mystery Cinema" is the same mystery movie as
    // "Mystery Cinema", so the strand comes off with it rather than being left
    // on the front of the standard title. A venue billing the strand as a day
    // out sells the same unnamed film, so the word goes with the billing
    // rather than being left on the end as "mystery movie day". Only the
    // singular: "mystery movie days" is a season rather than one screening.
    [
      /(free |monthly )?(late night )?(mystery|surprise) ((?!short )[\w+]+ )?((?!short )[\w+]+ )?(night|film|movie|cinema|screening|matinees?):?( Nov| \d| day\b)?/i,
      "mystery movie",
    ],
    // The strand is billed with the year it runs in on the front, so the
    // correction leaves "2026" sitting in front of the standard title and the
    // same unnamed film arrives under a second name. Only a year the title
    // opens on: a season that names itself before the year ("Horror Season
    // 2026 Classic Secret Screaming") needs the year left where the strand's
    // own phrase can take it off with the rest of the billing.
    [
      /(^\d{4} )?(classic |MUBI )?secret scre(e|a)(n|m)(ing)?( \d+)?/i,
      "mystery movie",
    ],
    [/secret (classic )?bollywood cinema/i, "mystery movie"],
    // The Nickel bills its unnamed films under a strand name and then the kind
    // of film it is: "Blue Monday" is the night, "Mystery XXX Cinema" is the
    // same unnamed film its other strands sell. Without this the strand name
    // survives on its own and the screening is grouped as "blue monday".
    [/^Blue Monday\s*[-–—]\s*mystery.*$/i, "mystery movie"],
    [/scre(e|a)(n|m) unseen/i, "mystery movie"],
    [
      /(Orange Box )?Secret Film Screenings?(:? Summer Series)?/i,
      "mystery movie",
    ],
    [/A CELLULOID SURPRISE #\d+/i, "mystery movie"],
    [/Mystery [^\s]+ Movie/i, "mystery movie"],
    [/^.* \+ mystery movie/i, "mystery movie"],
    ["vhs film", "movie"],
    [/The Bill Reunion \d+/i, "The Bill Reunion"],
    ["R.E.M. Buster", "R.E.M. X Buster"],
    [/(.*) presents: (.*)with R.E.M.'s (.*)/i, "$1 presents: R.E.M X $2$3"],
    ["-Dive in Wonderland-", " Dive in Wonderland "],
    ["Live stand-up + ", "Live stand-up & "],
    ["UCL East Community Cinema -", "UCL East Community Cinema: "],
    ["THIS IS NOT AN EXIT - ", "THIS IS NOT AN EXIT: "],
    ["Andres Veiel - ", "Andres Veiel: "],
    ["Gothic Film Festival - ", "Gothic Film Festival: "],
    ["ITALY THROUGH ITS CINEMA - ", "Italy Through its Cinema: "],
    ["Aussies in London - ", "Aussies in London: "],
    ["MOVIE CLUB - ", "Movie Club: "],
    ["HW4P Solidarity on Screen - ", "HW4P Solidarity on Screen: "],
    ["Beyond Kino - ", "Beyond Kino: "],
    ["LOVE & RAGE - MUNROE BERGDORF", "Love & Rage: Munroe Bergdorf"],
    [
      "Tarot readings, Demi Moore-tinis + ",
      "Tarot readings, Demi Moore-tinis & ",
    ],
    ["The Scarecrows' Wedding+ ", "The Scarecrows' Wedding & "],
    ["First Case, Second Case + ", "First Case, Second Case & "],
    [
      "100 Nights of Hero + A Friend of Dorothy",
      "100 Nights of Hero & A Friend of Dorothy",
    ],
    ["I Was a Teenage Serial Killer + ", "I Was a Teenage Serial Killer & "],
    ["MUBI Screening + ", "MUBI Screening: "],
    ["Homage |", "Homage: "],
    [/^\s*Twin Cheeks\s*$/i, "Twin Cheeks: Who Killed The Homecoming King?"],
    ["FRANCESCA WOODMAN", "The Woodmans"],
    [/^Screening(?!(?:\s+of\b|\s*\+|\s*&))(?=\s)/i, "Screening of "],
    ["Traitors - Live Final", "Traitors Finale"],
    ["TRAITORS 2026 FINAL SCREENING PARTY", "Traitors Finale"],
    ["Million Moments for Democracy", "Million Moments"],
    ["OPENING Eika Katappa", "Eika Katappa"],
    ["Labryinth", "Labyrinth"],
    ["THE WITCH THAT CAME FROM THE SEA", "The Witch Who Came from the Sea"],
    ["Mudlarking and Metamorphosis", "Mudlarking"],
    ["John Smith – World Famous", "Being John Smith"],
    ["From Lumière to Lloyd", "From Lumière to Speedy"],
    [
      /Master and Commander$/i,
      "Master and Commander: The Far Side of the World",
    ],
    [/£\d+ Tickets/i, ""],
    ["work / memories of work", "work & memories of work"],
    [/\s+man is not a b$/i, "man is not a bird"],
    [
      /\s+Teenage Mutant Ninja Turtles: Mutant M$/i,
      "Teenage Mutant Ninja Turtles: Mutant Mayhem",
    ],
    [
      "Dystopia is Not The Future: Panel Discussion",
      "Dystopia is Not The Future Panel Discussion",
    ],
    ["Wash It Film Premiere", "Wash It (2026)"],
    [
      "01 | A.I. | New Media | Experimental | Digital Arts Film Festival",
      "A.I New Media Experimental Digital Arts Film Festival",
    ],
    ["A.I. - Artificial Intelligence", "A.I. Artificial Intelligence"],
    ["Journey + A Wedding Suit", "Journey & A Wedding Suit"],
    ["We Lana Fel Khayal Hob", "Wa Lana Fel Khayal Hob"],
    ["Wa Lana Fel Khayal Hob", "Love, Imagined"],
    [
      "Corpus Callosum (2002) + Sshtoorrty (2005)",
      "Corpus Callosum (2002) & Sshtoorrty (2005)",
    ],
    [
      "The Experience + Orderly or Disorderly",
      "The Experience & Orderly or Disorderly",
    ],
    [/Scarecrows' Wedding \+ /i, "Scarecrows' Wedding & "],
    ["Tiddler + ", "Tiddler & "],
    ["Lost and Found + Shoom's Odyssey", "Lost and Found & Shoom's Odyssey"],
    ["Chico and Rita + 20 Años", "Chico and Rita & 20 Años"],
    [
      "HARD ROCK ZOMBIES + PRINCE OF DARKNESS",
      "Hard Rock Zombies & Prince of Darkness",
    ],
    ["BRICK MANSIONS + ", "BRICK MANSIONS & "],
    [
      "Under the Silver Lake (2018) + Tropico (2013)",
      "Under the Silver Lake (2018) & Tropico (2013)",
    ],
    // The strand pairs two shorts, and the separator rule below keeps only what
    // comes before the first plus, so both films have to be joined to survive.
    ["Replikka (2025) + ", "Replikka (2025) & "],
    ["Tellurian Drama (2020) + ", "Tellurian Drama (2020) & "],
    ["Tabby McTat + The Highway Rat", "Tabby McTat & The Highway Rat"],
    [
      "We're Going on a Bear Hunt + The Tiger Who Came to Tea",
      "We're Going on a Bear Hunt & The Tiger Who Came to Tea",
    ],
    [
      "Cane Toads: An Unnatural History + Animalicious",
      "Cane Toads: An Unnatural History & Animalicious",
    ],
    [
      "Hidden in Pieces + Night of the Hunter",
      "Hidden in Pieces & Night of the Hunter",
    ],
    [
      "Looney tunes: The day the world blew up",
      "Looney tunes: The day the earth blew up",
    ],
    ["Looney tunes - ", "Looney tunes: "],
    [/ A Looney$/i, " Looney tunes"],
    [
      /(The Scarecrows' Wedding)\s*\+\s*(The Smeds (and|&) the Smoos)/i,
      "$1 & $2",
    ],
    ["Oscars Best Picture", "Academy Awards Best Picture"],
    ["Academy Best Picture", "Academy Awards Best Picture"],
    ["Shoom's Odyssey", "Shooom's Odyssey"],
    ["THE PRESENT HELP", "PRESENT HELP"],
    ["Dress-up karaoke party + ", "Dress-up karaoke party & "],
    ["Spicy cocktail hour + ", "Spicy cocktail hour & "],
    [/Playdates with Friends Collect?i?o?n?/i, "Playdates with Friends"],
    ["BRING ME THE HORIZON - ", "BRING ME THE HORIZON: "],
    ["EPiC - ", "EPiC: "],
    ["Beats Rhymes & Life' - ", "Beats Rhymes & Life': "],
    ["ELLIOTT SMITH - ", "ELLIOTT SMITH: "],
    ["CINESOCIAL - ", "CINESOCIAL: "],
    [/O'? Romeo/i, "O'Romeo"],
    ["HEARTS OF DARKESS", "HEARTS OF DARKNESS"],
    [/\s+peaky blinders$/i, " peaky blinders the immortal man"],
    ["First Films - ", "First Films: "],
    ["See it First - ", "See it First: "],
    ["love island all stars finale", "love island the season finale"],
    [/^Drinks, /i, ""],
    ["Bluey At the Cinemas:", "Bluey At the Cinema:"],
    ["Cosi Fan Tutte: Mozart", "Cosi Fan Tutte"],
    ["Pompeii: Below the Clouds", "Pompei: Below the Clouds"],
    [/Guest `?Event - /i, "Guest Event: "],
    ["forty-five", "forty five"],
    ["Sixty-Year", "Sixty Year"],
    // The tour bills the city it is playing, and not every city is one word
    // ("in Buenos Aires", "in Sao Paulo"), so match the city rather than a
    // single word or the same show arrives under a name per city.
    [/ in [\p{L}\s'-]+: live(?: viewing)?$/iu, ""],
    [/Fri-GAY/i, "Friday"],
    ["If I Had Legs I Would Kick You", "If I Had Legs I'd Kick You"],
    [/: One Battle$/i, ": One Battle After Another"],
    ["(When the Rainbow Is Enuf)", "When the Rainbow Is Enuf"],
    ["?Arirang", "Arirang"],
    // One venue drops the tour from the front of the billing, so the same
    // show arrives under a second name. Anchored because the listings that do
    // carry it must not have it prefixed a second time.
    [/^BTS '?Arirang'?/i, "BTS World Tour 'Arirang'"],
    ["BTS World Tour - ", "BTS World Tour: "],
    ["Records, cocktails + ", "Records, cocktails: "],
    ["Roman party, divine chorals + ", "Roman party, divine chorals: "],
    ["SPICE WORLD MOVIE", "SPICE WORLD"],
    ["Lumiere Cinema, Romford", "Lumiere"],
    ["Lumiere Cinema", "Lumiere"],
    ["Kreator - Hate & Hope", "Kreator: Hate & Hope"],
    ["TNB XPO 2026 - ", "TNB XPO 2026: "],
    ["ADA - My Mother the Architect", "ADA: My Mother the Architect"],
    ["ADA - My Mother Architect", "ADA: My Mother the Architect"],
    ["B-Movie Women / ", "B-Movie Women: "],
    ["UK Cinema Premiere + Q&A: ", "UK Cinema Premiere & Q&A: "],
    ["LONDON | ", ""],
    ["BLOC CINEMA | ", "BLOC CINEMA: "],
    ["Faith Walk Film Premiere | ", "Faith Walk Film Premiere: "],
    [" / Bootlickers / ", " & Bootlickers & "],
    ["Sambhavam - Adhyayam Onnu", "Sambhavam Adhyayam Onnu"],
    ["Cinebug turns 1 - ", "Cinebug turns 1: "],
    [
      "Academy Awards Best Picture Winner 2026 - ",
      "Academy Awards Best Picture Winner 2026: ",
    ],
    ["Di'Anno - ", "Di'Anno: "],
    ["Gigi & Olive -", "Gigi & Olive: "],
    // Ognisko Polskie names every listing "<day> <month> | <title>", repeating
    // the date the listing already carries. hasSeparator takes everything
    // before the "|", so "10 Sep | Tovarisch" would reduce to "10 sep" and
    // every one of the club's listings would collapse onto its own date.
    // Removed here, before hasSeparator can fire. A regex rather than a
    // string because each listing carries a different date; the month name is
    // spelled out so a title opening with a number ("10 Things I Hate About
    // You | ...") isn't caught by it.
    [
      /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\|\s*/i,
      "",
    ],
    ["Kinoklub - ", "Kinoklub: "],
    // The same club lists the meal before its KinoKlub screening as a listing
    // of its own, naming only the dinner, so the film it belongs to has to be
    // put back or the dinner arrives as a title in its own right. Anchored so
    // only a listing that is nothing but the meal is renamed.
    // NOTE: This can be removed once the screening has passed
    [/^pre screening dinner$/i, "Kamerdyner (The Butler)"],
    ["Community Cinema at UCL East - ", "Community Cinema at UCL East: "],
    ["Cinema Night London - ", "Cinema Night London: "],
    ["An Afternoon Of Cinema - ", "An Afternoon Of Cinema: "],
    ["ASRA Club - ", "ASRA Club: "],
    ["Record Store Day - ", "Record Store Day: "],
    ["Drink & Dine - ", "Drink & Dine: "],
    ["Dog Friendly Cinema Screening - ", "Dog Friendly Cinema Screening: "],
    ["Jimmy Somerville - ", "Jimmy Somerville: "],
    ["Billie Eilish - ", "Billie Eilish: "],
    [/Hit Me Hard (and|&) Soft - /i, "Hit Me Hard and Soft: "],
    [
      /Hit Me Hard (and|&) Soft(?::\s*3D)?:?$/i,
      "Hit Me Hard and Soft: The Tour",
    ],
    [/Hit Me Hard (and|&) Soft\s*:?\s*Tour/i, "Hit Me Hard and Soft: The Tour"],
    ["Big Mama Thornton - ", "Big Mama Thornton: "],
    ["SinoUK - ", "SinoUK: "],
    [/Romford Film Festival 2026\s*- /i, "Romford Film Festival 2026: "],
    [/HKFF 2026-27\s*- /i, "HKFF 2026-27: "],
    ["Queer Rebel of English Pop", "Queer Rebel of British Pop"],
    ["Afronauts + ", "Afronauts & "],
    ["Fight Club: 4K Restoration", "Fight Club"],
    ["Cockroach + Hedwig", "Cockroach & Hedwig"],
    ["CARNIVAL OF BLOOD + ", "CARNIVAL OF BLOOD & "],
    ["The Room + ", "The Room & "],
    ["The Mystery of Chess Boxing + ", "The Mystery of Chess Boxing & "],
    ["Hitman In The Hand Of Buddha + ", "Hitman In The Hand Of Buddha & "],
    ["Just Drifting + ", "Just Drifting & "],
    ["with Greg Sestero in Audience + ", "with Greg Sestero in Audience & "],
    ["Gunnera (1969) + ", "Gunnera (1969) & "],
    ["Iggy the Eskimo Girl (1968) + ", "Iggy the Eskimo Girl (1968) & "],
    ["Psychedelia (1969) + ", "Psychedelia (1969) & "],
    ["San Francisco (1968) + ", "San Francisco (1968) & "],
    ["Phantom Beirut (1998) + ", "Phantom Beirut (1998) & "],
    ["Scorpio Rising + ", "Scorpio Rising & "],
    ["In the Year of the Quiet Sun + ", "In the Year of the Quiet Sun & "],
    ["Iggy the Eskimo Girl (2009) + ", "Iggy the Eskimo Girl (2009) & "],
    ["Charli XCX Zine Social + ", "Charli XCX Zine Social: "],
    ["Sneak Peek + ", "Sneak Peek & "],
    ["Screening + Performance", "Screening & Performance"],
    ["Season 2 Premiere + Q&A:", "Season 2 Premiere & Q&A:"],
    [/Members' wine tasting \+ (?:optional)?/i, "Members' wine tasting: "],
    ["+ A Look to Kill", " & A Look to Kill"],
    ["+ A Friend of Dorothy", " & A Friend of Dorothy"],
    ["+ Grenada:", "& Grenada:"],
    ["READY OT NOT 2", "READY OR NOT 2"],
    [/^Charak \(Hindi\)$/i, "Charak: Fair of Faith"],
    ["CLOSING Nuit de Chien", "Nuit de Chien"],
    [/ search 4 square$/i, "search for squarepants"],
    ["John & Yoko in NYC", "John & Yoko Live in NYC"],
    ["Man Marked for Death, Twenty Years Later", "Twenty Years Later"],
    [
      "An unremarkable man. A remarkable journey.",
      "The Unlikely Pilgrimage of Harold Fry",
    ],
    ["Scott Walker: 30th Century Man", "Scott Walker: 30 Century Man"],
    [/Raakaasaa?/i, "Rākāsā"],
    ["NAN GOLDIN - IN MY LIFE", "NAN GOLDIN: IN MY LIFE"],
    ["Anmol - Lovingly Ours", "Anmol: Lovingly Ours"],
    ["Dacoit: A Love Story", "Dacoit"],
    ["Elvira Notari: Beyond the Silence", "Elvira Notari: Beyond Silence"],
    ["National Emergency Briefing Film", "People's Emergency Briefing"],
    [
      /National Emergency Briefing(?: organisation)?/i,
      "People's Emergency Briefing",
    ],
    ["People's Emergency Briefing Twickenham", "People's Emergency Briefing"],
    ["People's Emergency Briefing for Business", "People's Emergency Briefing"],
    ["The The People's Emergency Briefing", "The People's Emergency Briefing"],
    ["TESTMortal Kombat IITEST", "Mortal Kombat II"],
    // TheMovieDB lists the film as "The Mandalorian and Grogu", without the
    // franchise name venues bill it under. Only this one: the saga films are
    // listed there with "Star Wars:" and must keep it.
    [/Star Wars:? (?=The Mandalorian|Mando )/i, ""],
    [
      /^(?:Dog Friendly: )?(?:Parent and Baby: )?The Mandalorian/i,
      "The Mandalorian",
    ],
    ["Mando & Grogu", "The Mandalorian and Grogu"],
    [/^LIK\s+/i, "LIK: Love Insurance Kompany "],
    [": TOTAS", " The Movie: Tears of the Azure Sea"],
    ["Bluey:", "Bluey at the Cinema:"],
    ["The Magick Lantern Cycle", "Magick Lantern Cycle"],
    ["Shrek: Swamp", "Shrek"],
    [/Kapodistrias[\s–:]+ The Governor/i, "Kapodistrias"],
    [/Film Festival:? Opening Night/i, "Film Festival - Opening Night"],
    ["Washington, DC", "Washington, D.C."],
    [/Glastonbury:? The Movie:?\s/i, "Glastonbury The Movie in Flashback: "],
    ["Andre Rieu - ", "Andre Rieu's "],
    ["Andre Rieu ", "Andre Rieu's "],
    ["Andre Rieu's Summer 2026:", "Andre Rieu's 2026 Summer Concert:"],
    [" + UK Premiere: Replikka", " + Replikka"],
    [/ [+&] Iggy Pop [–\-�] Lust for life/i, " & Lust for life"],
    [
      /Bluey At The Cinema - Playdates$/i,
      "Bluey At The Cinema: Playdates with Friends",
    ],
    ["A Night of Latin Jazz - ", "A Night of Latin Jazz: "],
    ["Classic Night - ", "Classic Night: "],
    ["Weird Wednesday - ", "Weird Wednesday: "],
    ["Kids Club - ", "Kids Club: "],
    ["My Five Year Plan", "My Five-Year Plan"],
    ["Bar Trash: 4TH BIRTHDAY - ", "Bar Trash: 4TH BIRTHDAY: "],
    ["Elon Musk Unveiled -", "Elon Musk Unveiled: "],
    ["Goethe-Kino - ", "Goethe-Kino: "],
    ["Henry Henry Henry + ", "Henry Henry Henry & "],
    ["Fundraiser + ", "Fundraiser & "],
    ["Le Beau Mec + ", "Le Beau Mec & "],
    ["The Life + Legacy", "The Life and Legacy"],
    [" - Oggi", ": Oggi"],
    [" x metropolis", " metropolis"],
    ["Nick Drake - ", "Nick Drake: "],
    ["Nick Drake: A Skin Too Few", "A Skin Too Few: The Days of Nick Drake"],
    ["(Screening) / ", "(Screening) & "],
    [
      "BEYOND ILLUSION - MAGIC DOCUMENTARY",
      "Beyond Illusion: The Making of a Magician - ",
    ],
    [/ELEPHANT SOCIAL - /i, "ELEPHANT SOCIAL: "],
    [/The Band - The Show/i, "The Band The Show"],
    ["DAVID HOCKNEY - A BIGGER SPLASH", "A BIGGER SPLASH"],
    [
      "The Day Innocence Died: Bloody Sunday + ",
      "The Day Innocence Died: Bloody Sunday and the Fight for Justice + ",
    ],
    ["Presentation & Screening - ", "Presentation & Screening: "],
    ["Hopper - ", "Hopper: "],
    ["Cezanne - ", "Cezanne: "],
    [
      "Haruki Murakami in Conversation + ",
      "Haruki Murakami in Conversation & ",
    ],
    ["Tour Party", "Tour"],
    [/.*\(A (.*) EXHIBITION\)/i, "$1"],
    ["ZOOTROPOLIS", "Zootopia"],
    ["DR DOLITTLE", "DOCTOR DOLITTLE"],
    ["• world premiere of ", ""],
    // Variant families collapsed from known-removable-phrases.js
    // Each pattern covers multiple near-identical string entries that shared a common structure
    [/dog[- ]?friendly(?:\s+screening)?[:\s]*/i, ""],
    [/ld[- ]?friendly(?:\s+screen(?:ing)?)?[:\s]*/i, ""],
    [/autism[- ]?friendly(?:\s+screening)?[:\s]*/i, ""],
    [/thrill seekers(?:\s+(?:ii|2\.0))?[:\s]*/i, ""],
    [/green screen[;:\s]+/i, ""],
    [/safar[:\s]+/i, ""],
    [/(MJ's\s+)?silver\s*screen[:\s]+/i, ""],
    [/world\s+\w+\s+day(?:\s+special)?[:\s]*/i, ""],
    [/earth day(?:\s+\d+)?[:\s]+/i, ""],
    [/l.ff(?:\s+202\d)?:/i, ""],
    [/liaf(?:\s+\d+)?:/i, ""],
    [/hkff(?:uk)?(?:\s+\d+)?:/i, ""],
    [/ AV SHOW$/i, ""],
    [/ Movie Screening$/i, ""],
    // The charity billing hung off the end of a title names whichever
    // charity, format or occasion the screening is raising money through
    // ("UK", "Special", "Medicinema", "35mm Edition UK"), so one pattern
    // rather than a string per billing. Anchored: "Skylarks Charity
    // Screening: Resilient Man" is a strand wrapped around the film that
    // follows it, and only a trailing billing has no film after it.
    [
      /\s*[-–—:]?\s*(?:35mm edition\s+)?(?:uk|special|medi\s?cinema)?\s*charity screenings?$/i,
      "",
    ],
    ["Tercera Video Club #2 - ", "Tercera Video Club #2: "],
    ["Paw Patrol Dino Movie", "Paw Patrol The Dino Movie"],
    ["Paw Patrol 3: The Dino Movie", "Paw Patrol The Dino Movie"],
    ["Medicinema - ", "Medicinema: "],
    ["Subtitle Cinema - ", "Subtitle Cinema: "],
    ["Disappearing Images (", "Disappearing Images -"],
    [
      "Protest & Recognition In Queer Islington: Film | ",
      "Protest & Recognition In Queer Islington: Film: ",
    ],
    [
      "Argentine season launch: Live music + ",
      "Argentine season launch: Live music & ",
    ],
    [
      "Pineapple cocktails, live music + ",
      "Pineapple cocktails, live music & ",
    ],
    ["CHUNGKING EXPRESS + ", "CHUNGKING EXPRESS & "],
    ["KIDS + ", "KIDS & "],
    ["BA Media Degree Show — Screening:", "BA Media Degree Show - "],
    ["CANCELLED DUE TO ILLNESS - ", "CANCELLED DUE TO ILLNESS: "],
    ["libya in motion (2015) film shorts", "libya in motion (2015)"],
    [
      "Paul McCarthy: Selected Video Works 1970-2025",
      "Paul McCarthy: Selected Video Works (1970-2025)",
    ],
    ["Burlesque Movie", "Burlesque"],
    [/ At The RA$/i, " at the Royal Academy of Arts"],
    ["Mamma Mia Party", "Mamma Mia"],
    ["Familier Touch", "Familiar Touch"],
    ["The Wrong Trousers + ", "The Wrong Trousers & "],
    [" - THE CALAMITY", ": THE CALAMITY"],
    [/Lolaki Video Club #\d{1,2} - /i, ""],
    ["JLG/JLG + ", "JLG/JLG: Self-Portrait in December + "],
    [/^Classic - /i, ""],
    ["THE WICKER MAN + ", "THE WICKER MAN & "],
    ["Virgina Woolf", "Virginia Woolf"],
    ["Wham! 10 Days in China Party", "Wham! 10 Days in China"],
    ["AJ Brennan Screening - ", "AJ Brennan Screening: "],
    ["Lamo Auru - ", "Lamo Auru: "],
    [
      /(What's Up )?Daiquiris, bag switcheroos \+ /i,
      "What's Up Daiquiris, bag switcheroos: ",
    ],
    ["One Day in Whitechapel + ", "One Day in Whitechapel & "],
    ["THE CABINET OF DR CALIGARI + ", "THE CABINET OF DR CALIGARI & "],
    [/Backrooms\s*:\s+Everything Must Go( Bonus)?( Edition)?/i, "Backrooms"],
    ["(500) Days of Summer", "500 Days of Summer"],
    ["Cucumbers Restoration", "Cucumbers"],
    ["T4T - ", "T4T: "],
    ["Remembering David Hockney", "David Hockney at the Royal Academy of Arts"],
    ["Parents & Baby Screening - ", "Parents & Baby Screening: "],
    ["RAMPAGE + ", "RAMPAGE & "],
    [" - live at the Blue", ": live at the Blue"],
    ["DEATH WISH CLUB + ", "DEATH WISH CLUB & "],
    [
      'Sapphic Cinema + BFI "Rip it Up" - ',
      'Sapphic Cinema & BFI "Rip it Up": ',
    ],
    [
      /(?<!A\s)Shaun The Sheep( Movie)?: Farmageddon/i,
      "A Shaun The Sheep Movie: Farmageddon",
    ],
    [
      "Shaun the Sheep: The Beast of the Mossy Bottom",
      "Shaun the Sheep: The Beast of Mossy Bottom",
    ],
    [
      /The Pirates! In An Adventure$/i,
      "The Pirates! In An Adventure with Scientists!",
    ],
    [/ Curse Were-Rabb$/i, " The Curse of the Were-Rabbit"],
    [
      "Wallace & Gromit Grand Day/Wrong",
      "Wallace & Gromit: A Grand Day Out & The Wrong Trousers",
    ],
    [
      "Wallace & Gromit: A Grand Day Out + ",
      "Wallace & Gromit: A Grand Day Out & ",
    ],
    [
      "Wallace & Gromit A Close/A Matter",
      "Wallace & Gromit: A Close Shave & A Matter of Loaf and Death",
    ],
    [
      "Wallace & Gromit: A Close Shave + ",
      "Wallace & Gromit: A Close Shave & ",
    ],
    [/^(The Music of Zimmer vs Williams) \d{4}/i, "$1"],
    [/, (\d{4}) @/, ", ($1) @"],
    ["TCB - ", "TCB: "],
    [
      /^Talking Tom Heroes:?( Suddenly Super)?( on the Big Screen)?$/i,
      "Talking Tom Heroes: Suddenly Super on the Big Screen",
    ],
    ["Martini cocktail hour + ", "Martini cocktail hour: "],
    [/^The Blinking Buzzards – .*$/i, "The Blinking Buzzards"],
    [/The Live Ghost Tent – .*$/i, "The Live Ghost Tent"],
    [/^Mastercard Preferred Tickets: Last Chance to Buy:$/i, "American Utopia"],
    ["The Price of Memory: Reparations", "The Price of Memory"],
    [
      "Summer Screenings at Greenford Quay -",
      "Summer Screenings at Greenford Quay: ",
    ],
    [/^35mm - (.*)/i, "$1 [35mm]"],
    ["Madonna - The Confessions Tour", "Madonna: The Confessions Tour"],
    ["CARRY GREENHAM HOME + ", "CARRY GREENHAM HOME & "],
    [
      "Traditional Polish cakes, hazelnut vodka + ",
      "Traditional Polish cakes, hazelnut vodka & ",
    ],
    ["Metropolis at 100", "Metropolis"],
    ["Halloween (1978) + ", "Halloween (1978) & "],
    // The pairing is billed with a plus, which the separator rule would
    // otherwise read as the end of the title and drop the second film
    // entirely. One venue publishes it without the spaces, so the plus is
    // matched with whatever whitespace it is given rather than a string per
    // spacing. Runs before the completion below, which needs the separator to
    // be a word apart from the title it is completing.
    [/We're Going on a Bear Hunt\s*\+\s*/i, "We're Going on a Bear Hunt & "],
    // Venues truncate the second half of the double bill to the words the book
    // shares with the film, so "The Tiger Who Came To" never reaches the title
    // it is short for - one drops the article as well and marks the cut with an
    // ellipsis ("Tiger Who Came to..."). Anchored to the end of the listing,
    // because the full "The Tiger Who Came To Tea" must be left alone.
    [
      /\s+(?:The\s+)?Tiger Who Came To(?:\s*(?:\.{3}|…))?$/i,
      " The Tiger Who Came To Tea",
    ],
    ["MORE PUNK THAN PUNK + ", "MORE PUNK THAN PUNK & "],
    // The book launch is the billing and the film is on the far side of the
    // plus, so the separator rule would keep the launch and drop the film
    // entirely. Joined here and the launch taken off as a phrase, which leaves
    // the film the evening is built around.
    ["Arrows of Desire Book Launch + ", "Arrows of Desire Book Launch & "],
    ["Sam Neill Tribute -", "Sam Neill Tribute: "],
    ["Miss Marple -", "Miss Marple: "],
    ["BFI 'Rip it Up' -", "BFI 'Rip it Up': "],
    ["Fassbinder – ", "Fassbinder: "],
    ["Jean Cocteau - ", "Jean Cocteau: "],
    [" + Endeli", " & Endeli"],
    ["Earth Wind & Fire Film", "That's the Way of the World"],
    ["Canal Film Club X TFFF - ", "Canal Film Club X TFFF: "],
    [" TFFF ", " "],
    ["Harry Potter Philosopher", "Harry Potter and the Philosopher"],
    ["Maybe Tomorrow + ", "Maybe Tomorrow & "],
    [/^Documentary (screenings? )?/i, ""],
    // Billed with the word "documentary" after the title, which is not part
    // of it.
    [/^Mission Accomplished documentary$/i, "Mission Accomplished"],
    ["Monkey's Shadow + Dance", "Monkey's Shadow & Dance"],
    [
      "The Last Guest at the Holloway Motel",
      "The Last Guest of the Holloway Motel",
    ],
    ["Madness: Take It or Leave It", "Take It or Leave It"],
    [/^Tonight: /i, ""],
    ["Freud's Afternoon Session - ", "Freud's Afternoon Session: "],
    ["Live folk music, Czech drinks + ", "Live folk music, Czech drinks & "],
    // The "+" would otherwise split the title there and keep the refreshments,
    // so it becomes "&" and the phrase list takes the refreshments off.
    [
      "Taiwanese nibbles, traditional drinks + ",
      "Taiwanese nibbles, traditional drinks & ",
    ],
    ["Evil Resident: Afterlife", "Resident Evil: Afterlife"],
    ["Khali Balak Min Nafsak", "Take Care of Yourself"],
    ["Transformers: 40th Anniversary Event", "The Transformers: The Movie"],
    ["SUNDAY SABBATH - ", "SUNDAY SABBATH: "],
    [/Horror for a Cause (-|–) /i, "Horror for a Cause: "],
    [/Save the Cinema Museum (-|–) /i, "Save the Cinema Museum: "],
    ["Nostalghia", "Nostalgia"],
    ["RETURN TO THE TATLER + ", "RETURN TO THE TATLER: "],
    ["SEYTAN + ", "SEYTAN & "],
    ["Sons/", "Sons /"],
    ["Halloween Cinema - ", "Halloween Cinema: "],
    [" – Join us for", " - Join us for"],
    ["Sinners (2024)", "Sinners (2025)"],
    [
      /Bring Your Own Baby Comedy (Finsbury Park|Greenwich|Clapham|East Dulwich)/i,
      "Bring Your Own Baby Comedy Club",
    ],
    ["Small World of Don Camillo", "Little World of Don Camillo"],
    ["OASIS: Don't Look Back in Anger", "Don't Look Back in Anger"],
    ["Ghost Strata + ", "Ghost Strata & "],
    [
      /Extreme Private Eros:? Love Song$/i,
      "Extreme Private Eros: Love Song 1974",
    ],
    ["Pulp: What Do You Do for an ", "Pulp: What Do You Do for an encore "],
    ["Rocky Horror 30 october", "The Rocky Horror Picture Show"],
    ["Bloody Marys + ", ""],
    [/^(.*): The Hunger Games Season/i, "The Hunger Games: $1"],
    ["The Hunger Games: The Hunger Games", "The Hunger Games"],
    [
      "Clapham International Film Festival - ",
      "Clapham International Film Festival: ",
    ],
    ["PsychCinema - ", "PsychCinema: "],
    ["E.J'S WARRIORS", "EJ's Warriors The Documentary"],
    [
      "National Theatre Live: Misanthrope",
      "National Theatre Live: The Misanthrope",
    ],
    ["We Will Find Happiness", "We'll Find Happiness"],
    ["The Making of Inglourious Basterds", "Inglourious Basterds"],
    ["an unmaried woman", "an unmarried woman"],
    ["AAHHH BELINDA", "AAAHH BELINDA"],
    [
      /Special Screening of Bitters$/i,
      "Special Screening of Bitter Sweet Ballad",
    ],
    [
      "The Conversation: An Afternoon with Walter Murch",
      "An Afternoon with Walter Murch",
    ],
    ["The Playhouse Buster Keaton", "The Play house Buster Keaton"],
    ["Art is my Therapy - ", "Art is my Therapy: "],
    [/^Fall 2$/i, "Fall 2: Deadpoint"],
    // The Dolly Parton comedy is listed under its numerals, and the anchored
    // spelling only reaches a listing that is nothing but the title - the
    // corrections run before the strand prefixes come off, so "Dementia-
    // Friendly Screening: 9 to 5" still carries its label here. Only the
    // worded separator is safe unanchored; "9 - 5" reads as a range anywhere
    // else in a title, so that spelling stays pinned to the whole of it.
    [/^9\s*[-–—]\s*5$/i, "Nine to Five"],
    [/\b9\s*to\s*5\b/i, "Nine to Five"],
    // One venue bills the concert film with the party it is screened at,
    // so the same film arrives under a second name. Anchored to the whole
    // title because a listing that is only a party has no film to fall back
    // to once the word comes off.
    [/^Queen Budapest Party$/i, "Queen Budapest"],
    // The gallery bills each night of the season as "Four Windows and a Room:
    // <that night's programme>", so every showing of the same season arrives
    // under a name of its own. The season name is the title here rather than a
    // strand wrapped around a film, so collapse the subtitle instead of
    // stripping the prefix.
    [/^Four Windows and a Room\b.*$/i, "Four Windows and a Room"],
    // Venues credit whoever plays the score and the performer changes with the
    // event, so one pattern rather than a string per composer. The wording
    // either side varies too - "with live score by", "+ Live Score by", or
    // just "live score by" - so match up to the "score by" that introduces the
    // credit. The listings that only say "with live score", naming nobody, are
    // left to the phrase list.
    [
      /\s*(?:[+&]\s*)?(?:\bw(?:ith|\/)\s+)?(?:new\s+|live\s+|original\s+)*score\s+(?:lead\s+)?by\s+.*$/i,
      "",
    ],
    // The ensemble performing a live score changes with the event, so a pattern
    // rather than a string per orchestra. End-anchored: "Musical Bingo with
    // Brixton Chamber Orchestra Celebrating ..." keeps its mid-title credit.
    [
      /\s*[-–—:,]?\s*\bwith\s+(?:the\s+)?[^,;()]{0,60}?\b(?:orchestra|philharmonic|sinfonia)\s*$/i,
      "",
    ],
    // Venues bill a discussion event as "<screening> and <panel> discussion of
    // <film>", with the wording varying on either side, so match the
    // "discussion of" that introduces the film rather than carrying a phrase
    // per spelling.
    [/^.*\bdiscussion of\s+/i, ""],
    // Venues credit a partner organisation on the end of the title and the
    // partner changes with the event, so one pattern rather than a string per
    // organisation. Spelled as "association" or "partnership" depending on the
    // venue, so match the separator rather than carrying a phrase per wording.
    // Bounded by a closing bracket for the listings that wrap the credit in one.
    [/\s*\bin (?:association|partnership) with\b[^)]*/i, ""],
    // One venue tags its own city onto the end of a title. Anchored to a title
    // that ends on a closing bracket, because plenty of films end on the words
    // themselves - "An American Werewolf in London", "A Year in London".
    [/\)\s+in London$/i, ")"],
    // ODEON are idiots -- correct their years
    ["THE HUNGER GAMES (2026)", "THE HUNGER GAMES (2012)"],
    [
      "The Hunger Games: Catching Fire (2026)",
      "The Hunger Games: Catching Fire (2013)",
    ],
    [
      "The Hunger Games: Mockingjay 1 (2026)",
      "The Hunger Games: Mockingjay 1 (2014)",
    ],
    [
      "The Hunger Games: Mockingjay 2 (2026)",
      "The Hunger Games: Mockingjay 2 (2015)",
    ],
    [
      "Hunger Games: Ballad of Songbirds&Snakes (2026)",
      "Hunger Games: Ballad of Songbirds & Snakes (2023)",
    ],
    // The film's a mystery, but here's a hint ...
    ["FREE Kids Movie Club: A Whole New World", "aladdin"],
    ["FREE Kids Movie Club: Carnival Weekend", "princess and the frog"],
    ["FREE Kids Movie Club: Into the Jungle", "jungle book"],
    ["FREE Kids Movie Club: Off to Neverland", "peter pan"],
    ["FREE Kids Movie Club: The Italian Riviera", "luca"],
    ["FREE Kids Movie Club: The Family Madrigal", "encanto"],
    ["FREE Kids Movie Club: Into the Highlands", "brave"],
    ["FREE Kids Movie Club: All That Jazz", "soul"],
    ["FREE Kids Movie Club: Monsters Welcome", "monsters inc"],
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

  const hasPresents = title.match(/\s+presents?:?(?:\s|…)+(.*?)$/i);
  // A company billing "<company> presents: <work>" is naming its own
  // production rather than wrapping a strand around a film, and the work's
  // name on its own collides with the film of it - "Sleeping Beauty" with the
  // animation. Keep the company on the front, the way the theatre prefixes do.
  if (hasPresents && !title.startsWith("english national ballet")) {
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
  // e.g. "Kids Club: Paddington in Peru" → "Paddington in Peru"
  // However, "Fight Club", which is a film title, could also match as a false
  // positive (e.g. "Fight Club: 4K Restoration"), so we need to check for it.
  if (hasClub && !title.startsWith("fight club")) {
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

  const hasMixer = matchesOpenPrefix(title, "mixer");
  if (hasMixer) {
    title = hasMixer[1];
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

  // e.g. "Tribute to Dolly Parton: Nine to Five" → "Nine to Five"
  const hasTribute = matchesStartingPrefix(
    title,
    "(?:a\\s+)?tribute to\\s+[^:;]+",
  );
  if (hasTribute) {
    title = hasTribute[1];
  }

  // One venue draws its billing blocks with the heavy box-drawing bar
  // ("EXPOSE ┃FILM PREMIERE┃LONDON"), which is the pipe in every way that
  // matters here, so it joins the separators rather than surviving as far as
  // the character stripping and leaving the billing behind as words.
  const hasSeparator = title.match(/^(.*?)\s+(?:\+|-|\/|\||•|┃)\s*/);
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

  // Collapse multiple years
  title = title.replace(/\((\d{4}),\s+(\d{4})\)/i, "($1/$2)");

  // Remove diretor or other notes from bracketted years
  // E.g. Convert "(1964, Glauber Rocha)" to "(1964)"
  const hasYearWithComment = title.match(/^(.*?)\s+\((\d{4}),\s[^)]+\)/i);
  if (hasYearWithComment) {
    title = `${hasYearWithComment[1]} (${hasYearWithComment[2]})`;
  }

  const hasSlavicPremier = title.match(/Кинопремиера на "([^"]+)" /i);
  if (hasSlavicPremier) {
    title = hasSlavicPremier[1];
  }

  const hasSlavicSecondScreening = title.match(
    /Втора прожекция на "([^"]+)" /i,
  );
  if (hasSlavicSecondScreening) {
    title = hasSlavicSecondScreening[1];
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
    /(^|\s+)\d+th ann(iversary)?( screenings?)?( edition)?( show)?( cut)?( of)?(\s+|$|:)/i,
    " ",
  );

  // Venues spell the cut with and without the possessive apostrophe and the
  // definite article, so one pattern rather than a string per spelling.
  title = title.replace(/\b(?:the )?directors?'?s? cut\b/i, "");

  // Venues credit whoever is introducing the screening, so the phrase varies by
  // guest and by article ("with introduction by", "with an introduction from").
  // One pattern rather than a string per guest, bounded to a short credit so a
  // title is never eaten. Runs before the phrase list, whose bare "with
  // introduction" would otherwise take the label off and leave the guest behind.
  title = title.replace(
    /\s+with\s+(?:an?\s+)?introduction\s+(?:by|from)\s+(?:[\w'.&/-]+\s*){1,6}$/i,
    "",
  );

  // Venues bill the set that comes with the screening using whichever
  // connective they like ("plus", "and", "with", "&"), so one pattern rather
  // than a string per spelling. Singular only: "Ceremony & Live Performances"
  // is the event being sold rather than a film with a set attached to it.
  title = title.replace(/\s*(?:plus|and|with|&)\s+live performance\b/i, "");

  // A venue bills a restoration with or without the scan it was made from
  // ("UK Premiere of 4K Restoration: Will", "UK Premiere of Restoration: Act
  // of Violence"), so one pattern rather than a string per format. The
  // premiere rule above has already taken "UK Premiere of" off the front by
  // the time this runs, so the strand is what is left there.
  title = title.replace(/^(?:\d+k\s+)?restoration:\s*/i, "");

  // Venues bill the last showings of a run in the singular or the plural
  // ("FINAL SHOW: Hamnet", "Final Shows: The Odyssey"), so one pattern rather
  // than a string per spelling.
  title = title.replace(/\bfinal shows?:\s*/i, "");

  // Venues bill the strand with and without the year it ran in ("Black History
  // Month: Alain Gomis' DAO", "Black History Month 2026: Sugarcane"), so one
  // pattern rather than a string per year.
  title = title.replace(/\bblack history month(?:\s+\d{4})?:\s*/i, "");

  // The Jewish film festival bills its strand with and without the year it
  // runs in ("UKJFF: Pink Lady", "UKJFF 2026: Shana"), so one pattern rather
  // than a string per year.
  title = title.replace(/\bukjff(?:\s+\d{4})?:\s*/i, "");

  // The same for the strand billed as a bare "IFF", with and without the year
  // ("IFF: Migration", "IFF 2026: Sundown"). A pattern rather than a string
  // per year, and anchored on a word boundary because the string list is not:
  // "IFF 2026:" matched inside "PRIFF 2026: Memory, Home & Exile" and left the
  // festival's initials behind as "pr", grouping the film under a key no other
  // venue could produce.
  title = title.replace(/\biff(?:\s+\d{4})?:\s*/i, "");

  // The festival names itself after the year it runs in ("Odyssey 2025: Hong
  // Kong New Talents", "Odyssey 2026: The Last Emperor"), so one pattern
  // rather than a string per year. The colon is required, so a film actually
  // named this way keeps its name.
  title = title.replace(/\bodyssey \d{4}:\s*/i, "");

  // The documentary festival's name is spelled a different way by every venue
  // billing it - the apostrophe lands before or after the "n", or goes missing
  // altogether - and the strand is named after it as often as not ("x Rio",
  // "FF 24", "Film Festival 2025", or the bare year in "Doc'n Roll 2026").
  // One pattern rather than a string per spelling. The colon is required, so a
  // film actually called this keeps its name.
  title = title.replace(
    /\bdoc\s?'?\s?n'?\s?roll(?:\s+x\s+rio|\s+ff\s+\d+|\s+film festival(?:\s+\d{4})?|\s+\d{4})?:\s*/i,
    "",
  );

  // Nosferatu's English subtitle comes off, so the 1922 film groups with the
  // bare "Nosferatu" the rest of the listings give it. Scoped to the film's
  // own billing: the Silents Synced screening ("Radiohead X Nosferatu: A
  // Symphony of Horror") is the album played over the film rather than the
  // film on its own, and keeps its subtitle so it stays a group apart from
  // the plain screenings. A pattern rather than a phrase-list entry because
  // the string list cannot read what comes before the phrase.
  title = title.replace(
    /(?<!radiohead x )\bnosferatu: a symphony of horror/i,
    "nosferatu",
  );

  // The knitting night numbers itself by volume ("Knitflix Club Vol. I: Mamma
  // Mia!"), so one pattern rather than a string per volume - the numeral is
  // the only thing that changes between them. Roman numerals, and the
  // abbreviation is matched with or without its full stop because a venue
  // publishes either.
  title = title.replace(/\bknitflix club vol\.?\s*[ivxlcdm]+:\s*/i, "");

  knownRemovablePhrases.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  // A festival's first night is a label wrapped around the film it opens with
  // ("Opening Night The Sound of the Shaking Earth"), so the words come off and
  // the film is what's left. They aren't a label when the opening night *is*
  // the event being sold - a party has no film to fall back to, and stripping
  // leaves the bare word to group with every other "party" on the listings.
  // Runs after the phrase list so the longer phrases that also name the opening
  // night ("BFI LFF: Opening Night Gala") still match in full.
  title = title.replace(/opening night (?!party\b)/i, "");

  // Venues credit whoever is doing the Q&A, so the phrase varies by guest and
  // by spelling ("w/" or "with"). One pattern rather than a string per guest,
  // bounded to a short credit so a title is never eaten up to a later "Q&A".
  // Runs after the phrase list so the longer phrases that also start on "with"
  // still match in full.
  title = title.replace(
    /\s+w(?:ith|\/)\s+(?:[\w'./-]+\s+){0,3}q(?:&|\+)a\b/i,
    "",
  );

  const hasYear = title.trim().match(/\(\d{4}\)$/);
  if (hasYear) {
    title = title.replace(/\((\d{4})\)$/, " ($1)"); // Add a space before it
  }

  if (!hasYear) {
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

  if (title.trim() === "") return backReturnTitle;

  return removeDiacritics(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00AD/g, "") // Remove soft hyphens
    .replace(/\uFFFD/g, "") // Remove Unicode Replacement Character
    .replace(/™/g, "") // Remove trademark symbol
    .replace(/\\/g, "")
    .replace(/\s*:\s+/g, ": ")
    .replace(/\s+[au]nd\s+/gi, " ")
    .replace(/(?:\s+|^)&\s+/gi, " ")
    .replace(/[:|&]$/, "")
    .replace(/'|`|\u200B|‘|’|"|“|”|²|®|,|/g, "")
    .replace(/\s+(-|–)(\s|$)/g, " ")
    .replace(/\s+(-|–)\s+/g, " ")
    .replace(/^(-|–)/g, "")
    .replace(/(-|–|\()$/g, "")
    .replace("?s", "s")
    .replace(/!|¡|\?|¿|:|;|\.|\*|…|—|]|<|>/g, " ")
    .replaceAll("–", "–")
    .replace(
      // Remove emoji
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/^(.+),\s+the$/, "the $1")
    .trim()
    .replace(/^the (?=\S+\s+(?![[(]))/i, "")
    .replace(/([a-z])-([a-z])/gi, "$1$2")
    .replace(/\s+q&a$/i, "")
    .replace(/\s3d$/i, "")
    .replace(/[+?]$/, "")
    .replace(/\(\d{4}-[^)]+\)$/, "") // Remove any date range suffixes
    .replace(/\([^)]+$/i, "") // Remove stuff in brackets where the last bracket got removed elsehwere (e.g. there was a separator within the brackets)
    .replace(/^([^(]+)\)$/i, "$1") // Remove trailing ending bracket
    .trim();
}

module.exports = normalizeTitle;

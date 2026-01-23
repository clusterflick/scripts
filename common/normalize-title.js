var removeDiacritics = require("diacritics").remove;
const knownRemovablePhrases = require("./known-removable-phrases");
const standardizePrefixingForTheatrePerformances = require("./standardize-prefixing-for-theatre-performances");

const matchesOpenPrefix = (title, phrase) =>
  title.match(new RegExp(`\\s+${phrase}[:;]\\s+(.*?)$`, "i"));

const matchesStartingPrefix = (title, phrase) =>
  title.match(new RegExp(`(?:^|\\s+)${phrase}[:;]\\s+(.*?)$`, "i"));

function normalizeTitle(title, options) {
  // Remove any odd whitespace including non-breaking spaces which could cause matching issues later
  title = title.replace(/\s+/g, " ");

  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  // Specific corrections
  const corrections = [
    [/:? The Movie$/i, ""],
    [/F1\s?®? The Movie/i, "F1"],
    ["The Fishermen", "The Fisherman"], // NOTE: This can be removed in the future once this specific misname has been removed
    [" + Cat", " and Cat"],
    [" + Zog", " and Zog"],
    [" + Superworm", " and Superworm"],
    [" + The Gruffalo's Child", " and The Gruffalo's Child"],
    [" + 28YL: The Bone Temple", " "],
    [" + The Bone Temple (", " "],
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
    // Remove prefix separators which will cause later processing to strip the wrong section
    [/Star Wars: Episode ([IV]+) - /i, "Star Wars: Episode $1 "], // Remove the dash
    ["Rafadan Tayfa - Kapadokya", "Rafadan Tayfa: Kapadokya"],
    ["Average Rob -", "Average Rob:"],
    ["Roger Waters -", "Roger Waters:"],
    ["CBeebies Musical - ", "CBeebies Musical: "],
    ["CBeebies - ", "CBeebies: "],
    ["CBeebies Panto 2025", "CBeebies Panto"],
    ["Ex Libris - ", "Ex Libris: "],
    ["Bison - ", "Bison: "],
    ["COLD ISLANDERS - ", "COLD ISLANDERS: "],
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
    ["Film Africa 2025 -", "Film Africa 2025:"],
    ["Preview Screening - ", "Preview Screening: "],
    ["Cinema Film Screening - ", "Cinema Film Screening "],
    ["Closing Night + Awards", "Closing Night and Awards"],
    ["Poetry Slam", "Event: Poetry Slam"],
    ["Scared To Dance -", "Scared To Dance "],
    ["ODEON Pride Nights - ", "ODEON Pride Nights "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["Green Screen -", "Green Screen "],
    ["Film Club -", "Film Club: "],
    ["Crafty Movie Night - ", "Crafty Movie Night: "],
    ["Girlguiding Screening - ", "Girlguiding Screening: "],
    ["SEEN Charity Film Screening - ", "SEEN Charity Film Screening: "],
    [/^SILVER\s*?SCREEN -/i, "SILVER SCREEN"],
    ["SUBTITLED -", "SUBTITLED "],
    [/^RELAXED -/i, "Relaxed screening: "],
    ["RELAXED Disney's", "Relaxed screening: Disney's"],
    ["Mamma Mia-", "Mamma Mia -"],
    ["CELLULOID JAM! –", "CELLULOID JAM! "],
    ["Saturday night at the movies -", "Saturday night at the movies:"],
    ["Pierre Boulez - Boulez", "Pierre Boulez "],
    ["twin peaks - ", "twin peaks "],
    [" - Part 1 - ", " I: "],
    ["- Part ", "Part "],
    ["- FREE ENTRY", "FREE ENTRY"],
    ["- Live From", "Live From"],
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
    ["Björk’s", "Björk"],
    ["Funny Games / Funny Games US", "Funny Games Double Bill"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["The Return The Return", "The Return"],
    ["Wildnerness", "Wilderness"],
    [/\s+dub?$/i, ""], // Dubbed
    [/\s+sub?$/i, ""], // subbed
    [/\s+(3|2)d$/i, ""], // 3d or 2d
    [/\s+2026$/i, ""], // Year
    ["Vasthunnam", "Vasthunam"],
    ["Melagaon", "Malegaon"],
    ["Chadian", "Chadum"],
    ["Carvaggio", "Caravaggio"],
    ["Seigfried", "Siegfried"],
    ["Acroyd", "Ackroyd"],
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
    ["Frozen 2", "Frozen II"],
    ["Terminator 2 Live", " Terminator 2"],
    [/\s+terminator 2$/i, " Terminator 2 Judgment Day"],
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
    [
      "Films that F*ck 2: Californian Gay Pornotragedies",
      "Victim of Circumstance",
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
      "Bluey at the Cinema: Let’s Play Chef Collection",
    ],
    [": Let's Chef Collection", " Let’s Play Chef Collection"],
    [": Chef Collection", " Let’s Play Chef Collection"],
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
    ["‘PAST PRESENT FUTURE’ PODCAST", "‘PAST+PRESENT+FUTURE’ PODCAST"],
    ["Past Present Future Podcast", "Past+Present+Future Podcast"],
    ["seventeen [right here]", "seventeen right here"], // remove brackets from this band name
    ["Exclusive Screening of Highly Acclaimed Bengali Feature Film - ", ""],
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
    ["Mission: Impossible - ", "Mission: Impossible – "],
    ["Mission: Impossible 8 (", "Mission: Impossible – The Final Reckoning ("],
    ["Mission: Impossible 2", "Mission: Impossible II"],
    ["MI 8: The Final Reckoning", "Mission: Impossible – The Final Reckoning"],
    ["M:I Season - ", "M:I Season: "],
    [/M:I Season: (?!Mission)/i, "M:I Season: Mission: Impossible – "],
    [/Dead Reckoning$/i, "Dead Reckoning Part One"],
    [/Dead Reckoning (?!Part)/i, "Dead Reckoning Part One "],
    ["Children’s Classics on 16mm", "Children’s Classics 16mm"],
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
    ["OCEAN WITH DAVID ATTENBOROUGH", "David Attenborough: Ocean"],
    [/(^|\s)Sylvanian Families$/i, " Sylvanian Families The Movie"],
    ["Gravy Train Screening", "Gravy Train Short Film"],
    [
      "African Kung Fu Nazis & African Kung Fu Nazis II",
      "African Kung Fu Nazis and African Kung Fu Nazis II Double Bill",
    ],
    ["Silents Synced - ", "Silents Synced: "],
    ["Gama Bomb - ", "Gama Bomb: "],
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
    ["Oslo Stories Trilogy:", "Oslo Stories:"],
    [
      /^The Invisible Doctrine /i,
      "The Invisible Doctrine: The Secret History of Neoliberalism ",
    ],
    ["The Fantastic Four: First Steps", "The Fantastic 4: First Steps"],
    ["Pip and Posy's", "Pip and Posy"],
    ["10 + 10", "10 plus 10"],
    ["Super Connected Live", "Super Connected"],
    ["wall-e", "WALL·E"],
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
    [/^(.+) Block \d+(.+FF(\s+\d{4})?)?$/i, "$1 Block $2"],
    [/Kantara:? A Legend/i, "Kantara"],
    [" - Chapter ", ": Chapter "],
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
    ["The Extra Terrestrial", "The Extra-Terrestrial"],
    // Work around a weird issue with the moviedb API and a soft hyphen in the listing title
    [/Tales from the Mag(\u00AD)?ic Garden/i, "Tales from the Garden"],
    [" – Q&A with ", " + Q&A with "],
    ["Homosexual –", "Homosexual ("],
    ["Stendalì: Still They Toll + ", ""],
    [/\s+Part\s+(\d+)(\s|:|$)/i, " $1$2"],
    ["Bāhubali", "Baahubali"],
    ["Khatarnaak", "Khatarnak"],
    ["Thalaimayil", "Thalaimaiyil "],
    ["MEMBERS ONLY: Pumpkin Carving", "Members only pumpkin carving"],
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
    [/\(Double(-|\s)?Bill\)/i, " Double Bill "],
    [/Double(-|\s)?Bill/i, "Double Bill"],
    [/-? Double Feature/i, " Double Bill "],
    [/Wicked [+|/] Wicked[:]? For Good/i, "Wicked & Wicked: For Good"],
    [/Wicked:? Double Bill/i, "Wicked & Wicked: For Good Double Bill"],
    [/The God Father/i, "The Godfather"],
    ["Le Litre de lait + Les Contrebandières", "Les Contrebandières"],
    ["ELF MOVIE", "Elf"],
    ["Screening + Q&A:", "Screening & Q&A:"],
    [
      "Sapphic Cinema and BFI Melodrama -",
      "Sapphic Cinema and BFI Melodrama: ",
    ],
    [/^(.+)- National Theatre Live$/i, "National Theatre Live: $1"],
    [
      "MUPPET PUPPETS CHRISTMAS CAROL WORKSHOP & SING-ALONG",
      "Muppet Christmas Carol",
    ],
    ["Film Club |", "Film Club: "],
    ["IN-HOUSE - ", "IN-HOUSE: "],
    ["BAR TRASH - ", "BAR TRASH: "],
    ["Guest Event - ", "Guest Event: "],
    ["Tony Palmer film - ", "Tony Palmer film: "],
    ["Throwback - ", "Throwback: "],
    ["Toddler - ", "Toddler: "],
    ["Popcorn Nights - ", "Popcorn Nights: "],
    [
      "Tony Palmer film: Story of Popular Music",
      "All You Need Is Love: The Story of Popular Music",
    ],
    ["Goethe Annual Lecture 2025 - ", "Goethe Annual Lecture 2025: "],
    [
      /All Out of Bubblegum Film Club \d+ \//i,
      "All Out of Bubblegum Film Club: ",
    ],
    [/^Watch (.+) with RKG & Friends$/i, "$1"],
    ["EXPOSED aka EXPONERAD", "EXPONERAD"],
    ["THE SEDUCERS AKA TOP SECRET", "THE SEDUCERS"],
    ["Song O Chyabrung", "Song Of Chyabrung"],
    [
      /Marcel,? Santa and the Little Pizza Delivery Man/i,
      "Marcel, Father Christmas and the Little Pizza Delivery Boy",
    ],
    ["Migrant Cinema - ", "Migrant Cinema: "],
    ["muppets christmas carol", "muppet christmas carol"],
    [
      /^Dr\.? Strangelove$/i,
      "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    ],
    ["Prime Minster", "Prime Minister"],
    [/Akhanda 2(\s+\(Telugu\))?$/i, "Akhanda 2: Thaandavam"],
    ["LES LIAISONS DANSEREUSES", "LES LIAISONS DANGEREUSES"],
    ["Search4Square", "Search for SquarePants"],
    [
      /Snakes and Ladders: Childish Actions/i,
      "Snakes and Ladders 2: Children's Games",
    ],
    [/Ella Mc Cay/i, "Ella McCay"],
    ["Superman 2025", "Superman (2025)"],
    ["A Minecraft Movie Premiere", "A Minecraft Movie"],
    ["Evgenij Onegin", "Eugene Onegin"],
    ["NOVELLE VAGUE", "NOUVELLE VAGUE"],
    [/^Bowie:? The Final Act/i, "David Bowie: The Final Act"],
    [/: Bowie:? The Final Act/i, ": David Bowie: The Final Act"],
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
    ["Romford Horror 2026 -", "Romford Horror 2026:"],
    ["Romford Horror Festival 2026 -", "Romford Horror 2026:"],
    ["Opening Night -", "Opening Night "],
    [
      /(free |monthly )?mystery ([\w+]+ )?([\w+]+ )?(night|film|movie|cinema|screening)( Nov| \d)?/i,
      "mystery movie",
    ],
    [/(classic )?secret scre(e|a)(n|m)ing( \d+)?/i, "mystery movie"],
    [/secret (classic )?bollywood cinema/i, "mystery movie"],
    [/scre(e|a)(n|m) unseen/i, "mystery movie"],
    [/(Orange Box )?Secret Film Screenings?/i, "mystery movie"],
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
    ["Aussies in London - ", "Aussies in London: "],
    ["MOVIE CLUB - ", "Movie Club: "],
    [
      "Tarot readings, Demi Moore-tinis + ",
      "Tarot readings, Demi Moore-tinis & ",
    ],
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
    /(^|\s+)\d+th ann(iversary)?( screenings?)?( edition)?(\s+|$)/i,
    " ",
  );

  knownRemovablePhrases.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  const hasYear = title.trim().match(/\(\d{4}\)$/);
  if (hasYear) {
    title = title.replace(/\((\d{4})\)$/, " ($1)"); // Add a space before it
  }

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

  return removeDiacritics(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00AD/g, "") // Remove soft hyphens
    .replace(/\uFFFD/g, "") // Remove Unicode Replacement Character
    .replace(/™/g, "") // Remove trademark symbol
    .replace(/\\/g, "")
    .replace(/\s*:\s+/g, ": ")
    .replace(/\s+[a|u]nd\s+/gi, " ")
    .replace(/(?:\s+|^)&\s+/gi, " ")
    .replace(/[:|&]$/, "")
    .replace(/'|`|\u200B|‘|’|"|“|”|²|®|,|/g, "")
    .replace(/\s+(-|–)(\s|$)/g, " ")
    .replace(/\s+(-|–)\s+/g, " ")
    .replace(/^(-|–)/g, "")
    .replace(/(-|–|\()$/g, "")
    .replace(/!|:|;|\.|\*|…|—|]|<|>/g, " ")
    .replaceAll("–", "–")
    .replace(
      // Remove emoji
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/^(.+),\s+the$/, "the $1")
    .trim()
    .replace(/^the /i, "")
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

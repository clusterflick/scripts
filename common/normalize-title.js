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

  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  // Keep a copy after basic processing in case we need a different return value
  const backReturnTitle = title;

  // Specific corrections
  const corrections = [
    ["&amp;", "&"],
    ["HANNAH MONTANA: THE MOVIE", "HANNAH MONTANA MOVIE"],
    [/:? The Movie$/i, ""],
    [/F1\s?®? The Movie/i, "F1"],
    [/Batman\s?:? The Movie/i, "Batman"],
    ["The Fishermen", "The Fisherman"], // NOTE: This can be removed in the future once this specific misname has been removed
    [" + Cat", " and Cat"],
    [" + Zog", " and Zog"],
    ["Zog + ", "Zog & "],
    [" + Superworm", " and Superworm"],
    [" + The Gruffalo's Child", " and The Gruffalo's Child"],
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
    ["Film Africa 2025 -", "Film Africa 2025:"],
    ["Preview Screening - ", "Preview Screening: "],
    ["Cinema Film Screening - ", "Cinema Film Screening "],
    ["Cinema Film Screening & Talk - ", "Cinema Film Screening & Talk: "],
    ["Closing Night + Awards", "Closing Night and Awards"],
    ["Poetry Slam", "Event: Poetry Slam"],
    ["Scared To Dance -", "Scared To Dance "],
    ["ODEON Pride Nights - ", "ODEON Pride Nights "],
    ["VIP TV/FILM INDUSTRY SCREENING - ", "VIP TV/FILM INDUSTRY SCREENING: "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["Green Screen -", "Green Screen "],
    [/Film Club\s*-\s*/i, "Film Club: "],
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
    ["Björk's", "Björk"],
    ["Funny Games / Funny Games US", "Funny Games Double Bill"],
    ["The Tou 3D", "The Tour 3D"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["The Return The Return", "The Return"],
    ["Wildnerness", "Wilderness"],
    [/\s+dub?$/i, ""], // Dubbed
    [/\s+sub?$/i, ""], // subbed
    [/\s+(?:live\s+)?(?:in\s+)?(3|2)d$/i, ""], // 3d or 2d, with optional "live in" prefix
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
    ["Lagan Laagi Re", "Lagan Laagii Re"],
    ["Vidhaata", "Viddhaata"],
    ["Badhu Alright che", "Badhu Alright chhe"],
    ["Maa Inti Bangaaram", "Maa Inti Bangaram"],
    ["Main Vaapas Aunga", "Main Vaapas Aaunga"],
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
    ["Pip and Posy's", "Pip and Posy"],
    ["10 + 10", "10 plus 10"],
    ["Super Connected Live", "Super Connected"],
    [/wall[-•]e/i, "WALL·E"],
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
    ["The Extra Terrestrial", "The Extra-Terrestrial"],
    [/^E\.T\.$/i, "E.T. the Extra-Terrestrial"],
    // Work around a weird issue with the moviedb API and a soft hyphen in the listing title
    [/Tales from the Mag(\u00AD)?ic Garden/i, "Tales from the Garden"],
    [" – Q&A with ", " + Q&A with "],
    ["Homosexual –", "Homosexual ("],
    ["Stendalì: Still They Toll + ", ""],
    [/\s+Part\s+(\d+)(\s|:|$)/i, " $1$2"],
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
    ["Film Club |", "Film Club: "],
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
      /(free |monthly )?mystery ([\w+]+ )?([\w+]+ )?(night|film|movie|cinema|screening):?( Nov| \d)?/i,
      "mystery movie",
    ],
    [/(classic )?secret scre(e|a)(n|m)ing( \d+)?/i, "mystery movie"],
    [/secret (classic )?bollywood cinema/i, "mystery movie"],
    [/scre(e|a)(n|m) unseen/i, "mystery movie"],
    [
      /(Orange Box )?Secret Film Screenings?(:? Summer Series)?/i,
      "mystery movie",
    ],
    [/^.* \+ mystery movie/i, "mystery movie"],
    [/Surprise Film (\d{1,2}\.\d{1,2}\.\d{1,2})?/i, "mystery movie"],
    [/(\w+ Film Festival: )?Surprise Screening/i, "mystery movie"],
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
    [
      "Under the Silver Lake (2018) + Tropico (2013)",
      "Under the Silver Lake (2018) & Tropico (2013)",
    ],
    ["Tabby McTat + The Highway Rat", "Tabby McTat & The Highway Rat"],
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
    ["love island all stars finale", "love island the season finale"],
    [/^Drinks, /i, ""],
    ["Bluey At the Cinemas:", "Bluey At the Cinema:"],
    ["Cosi Fan Tutte: Mozart", "Cosi Fan Tutte"],
    ["Pompeii: Below the Clouds", "Pompei: Below the Clouds"],
    [/Guest `?Event - /i, "Guest Event: "],
    ["forty-five", "forty five"],
    [/ in \w+: live(?: viewing)?$/i, ""],
    [/Fri-GAY/i, "Friday"],
    ["If I Had Legs I Would Kick You", "If I Had Legs I'd Kick You"],
    [/: One Battle$/i, ": One Battle After Another"],
    ["(When the Rainbow Is Enuf)", "When the Rainbow Is Enuf"],
    ["?Arirang", "Arirang"],
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
    ["Queer Rebel of English Pop", "Queer Rebel of British Pop"],
    ["Afronauts + ", "Afronauts & "],
    ["Fight Club: 4K Restoration", "Fight Club"],
    ["Cockroach + Hedwig", "Cockroach & Hedwig"],
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
    ["Scott Walker: 30th Century Man", "Scott Walker: 30 Century Man"],
    [/Raakaasaa?/i, "Rākāsā"],
    ["NAN GOLDIN - IN MY LIFE", "NAN GOLDIN: IN MY LIFE"],
    ["Anmol - Lovingly Ours", "Anmol: Lovingly Ours"],
    ["Dacoit: A Love Story", "Dacoit"],
    ["Elvira Notari: Beyond the Silence", "Elvira Notari: Beyond Silence"],
    ["National Emergency Briefing Film", "People's Emergency Briefing"],
    ["National Emergency Briefing", "People's Emergency Briefing"],
    ["People's Emergency Briefing Twickenham", "People's Emergency Briefing"],
    ["TESTMortal Kombat IITEST", "Mortal Kombat II"],
    [
      /^(?:Dog Friendly: )?(?:Parent and Baby: )?The Mandalorian/i,
      "Star Wars: The Mandalorian",
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
    ["Andre Rieu - ", "Andre Rieu: "],
    ["Andre Rieu: Summer 2026:", "Andre Rieu's 2026 Summer Concert:"],
    [" + UK Premiere: Replikka", " + Replikka"],
    [/ [+&] Iggy Pop [–\-�] Lust for life/i, " & Lust for life"],
    [
      /Bluey At The Cinema - Playdates$/i,
      "Bluey At The Cinema: Playdates with Friends",
    ],
    ["A Night of Latin Jazz - ", "A Night of Latin Jazz: "],
    ["Classic Night - ", "Classic Night: "],
    ["Weird Wednesday - ", "Weird Wednesday: "],
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
    ["Tercera Video Club #2 - ", "Tercera Video Club #2: "],
    ["Paw Patrol Dino Movie", "Paw Patrol 3: The Dino Movie"],
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
    [/(?<!A\s)Shaun The Sheep( Movie)?:/i, "A Shaun The Sheep Movie:"],
    [
      /The Pirates! In An Adventure$/i,
      "The Pirates! In An Adventure with Scientists!",
    ],
    [/ Curse Were-Rabb$/i, " The Curse of the Were-Rabbit"],
    [
      "Wallace & Gromit Grand Day/Wrong",
      "Wallace & Gromit A Grand Day Out & The Wrong Trousers",
    ],
    [
      "Wallace & Gromit A Close/A Matter",
      "Wallace & Gromit A Close Shave & A Matter of Loaf and Death",
    ],
    [/^(The Music of Zimmer vs Williams) \d{4}/i, "$1"],
    [/, (\d{4}) @/, ", ($1) @"],
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

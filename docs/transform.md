# Transform Pipeline

The transform pipeline is responsible for converting raw cinema listing data
into a standardized, enriched format. It takes scraped data from cinema websites
and produces validated, matched movie entries ready for consumption.

## Overview

The transform process runs for each cinema location and performs the following
high-level steps:

1. **Source External Events** - Gather supplementary event data from external
   ticketing platforms
2. **Transform Raw Data** - Convert location-specific raw data into standardized
   format
3. **Match Against The Movie DB** - Enrich entries with metadata from The Movie
   Database (TMDB)
4. **Check Historical Data** - Track when movies were first seen and recover
   missing entries
5. **Categorise Entries** - Use LLM to classify entries (movie, TV, quiz, etc.)
6. **Process Multi-Movie Events** - Handle double bills, marathons, and
   trilogies
7. **Validate Output** - Ensure data conforms to the JSON schema

## Flow Diagram

```mermaid
flowchart TD
    subgraph Input
        A[Raw Cinema Data] --> B[Transform Pipeline]
        C[Previous Release Data] --> B
        D[Historical Seen Data] --> B
    end

    subgraph "Transform Pipeline"
        B --> E[Get Sourced Events]
        E --> F[Location-Specific Transform]
        F --> G[Sort & Filter Movies]
        G --> H{Match Against TMDB}

        H --> I[Check Historical Data]
        I --> J[Recover Missing Movies]
        J --> K[Categorise Entries]
        K --> L{Is Multi-Movie?}

        L -->|Yes| M[Identify & Match Multiple Movies]
        L -->|No| N[Remove Matching Hints]
        M --> N

        N --> O[Validate Against Schema]
        O --> P[Check for Duplicate IDs]
    end

    subgraph Output
        P --> Q[Matched & Validated Data]
    end

    style H fill:#f9f,stroke:#333,stroke-width:2px
    style M fill:#f9f,stroke:#333,stroke-width:2px
```

## Pipeline Stages

### 1. Get Sourced Events

Before transforming cinema data, the pipeline gathers supplementary event data
from external ticketing platforms. This includes:

- **DesignMyNight** - Event booking platform
- **Dice.fm** - Event ticketing
- **Eventbrite** - Event management
- **OutSavvy** - Independent event ticketing
- **TicketSource** - Box office services
- **TicketTailor** - Event ticketing

Each source's `findEvents` function is called with the cinema's attributes
(coordinates, name, etc.) to find matching events that can supplement the main
cinema data.

### 2. Location-Specific Transform

Each cinema location has its own transform module that knows how to parse its
specific data format. The transform function:

- Parses raw HTML/JSON from the cinema's website
- Extracts movie titles, showtimes, booking URLs
- Normalizes the data into the standard schema
- May incorporate sourced events data
- Returns an array of movie objects

The result is sorted and filtered to remove duplicates and invalid entries.

### 3. Match Against The Movie DB

This is the most complex stage and is
[documented separately below](#the-movie-db-matching).

Each movie is matched against The Movie Database (TMDB) API to enrich it with:

- TMDB ID for cross-referencing
- Official title
- Release date
- Plot summary
- Runtime (if not already present)

### 4. Check Historical Data

The pipeline tracks when each movie listing was first seen:

- **Previously seen movies** - Preserve the original `seen` timestamp
- **New movies** - Set `seen` to the current timestamp

This allows tracking of how long a movie has been listed, even if it temporarily
disappears and reappears.

### 5. Recover Missing Movies

For opted-in locations, the pipeline checks if any movies from the previous
release are missing:

```mermaid
flowchart TD
    A[Previous Release Movie] --> B{Has Future Performances?}
    B -->|No| C[Skip - Past Movie]
    B -->|Yes| D{Exists by Showing ID?}
    D -->|Yes| E[Skip - Already Present]
    D -->|No| F{Exists by Performances?}
    F -->|Yes| G[Skip - Already Present]
    F -->|No| H{URL Still Active?}
    H -->|No| I[Skip - Removed]
    H -->|Yes| J{Page Shows Not Found?}
    J -->|Yes| K[Skip - Page Not Found]
    J -->|No| L{Matches Redirect URL?}
    L -->|Yes| M[Skip - Renamed]
    L -->|No| N{Matches Canonical URL?}
    N -->|Yes| O[Skip - Renamed]
    N -->|No| P[Add Missing Movie]
```

This prevents movies from being dropped when:

- A cinema temporarily removes a listing
- Technical issues cause scraping failures
- Movies are renamed or URLs change

### 6. Categorise Entries

Movies without a TMDB match are categorized using an LLM. Categories include:

| Category          | Description                        |
| ----------------- | ---------------------------------- |
| `movie`           | Single full-length film screening  |
| `multiple-movies` | Double bills, marathons, trilogies |
| `tv`              | TV show episode screenings         |
| `shorts`          | Programme of short films           |
| `quiz`            | Quiz events                        |
| `comedy`          | Stand-up, open mic                 |
| `music`           | Concerts, album playbacks          |
| `talk`            | Discussions, panels                |
| `workshop`        | Workshop events                    |
| `event`           | Catch-all for uncategorized        |

The LLM analyzes the title and description to determine the category with a
confidence score.

### 7. Process Multi-Movie Events

For events categorized as `multiple-movies`, the pipeline:

1. Uses LLM to identify individual films from the event description
2. Filters to high-confidence identifications (≥7)
3. Matches each identified film against TMDB
4. Stores results in `themoviedbs` array (plural)

### 8. Validate Output

Final validation ensures:

- Data conforms to the JSON schema (using AJV)
- No duplicate `showingId` values exist

---

## The Movie DB Matching

The TMDB matching process is sophisticated, with multiple strategies to find the
correct match while avoiding false positives.

### Matching Flow Diagram

```mermaid
flowchart TD
    subgraph "Title Preparation"
        A[Movie Entry] --> B[Normalize Title]
        B --> C[Extract Year from Title]
        C --> D{Forced Match Exists?}
        D -->|Yes| E[Return Forced Match]
        D -->|No| F[Continue Matching]
    end

    subgraph "Director-Based Search"
        F --> G{Has Director Info?}
        G -->|Yes| H[Search Person API]
        H --> I[Get Director Credits]
        I --> J{Title Match in Credits?}
        J -->|Yes| K[Return Director Match]
        J -->|No| L[Continue to Title Search]
        G -->|No| L
    end

    subgraph "Title-Based Search"
        L --> M{Has Year?}
        M -->|No| N[Search by Title Only]
        M -->|Yes| O[Search by Primary Year]

        N --> P{Best Match Found?}
        O --> Q{Best Match Found?}

        P -->|No| R[Search Including Adult]
        Q -->|No| S[Search Related Year]

        R --> T{Match Found?}
        S --> U{Match Found?}

        T -->|No| V[LLM Review Results]
        U -->|No| W[Search Next Year]

        W --> X{Match Found?}
        X -->|No| Y[Search Without Year]
        Y --> Z{Match Found?}
        Z -->|No| V
    end

    subgraph "LLM Fallback"
        V --> AA[LLM Analyze Movie]
        AA --> AB{High Confidence?}
        AB -->|Yes| AC[Search with LLM Data]
        AB -->|No| AD{Forced Match?}
        AC --> AE{Match Found?}
        AE -->|No| AD
        AD -->|Yes| AF[Return Forced Match]
        AD -->|No| AG[No Match]
    end

    K --> AH[Return Match]
    P -->|Yes| AH
    Q -->|Yes| AH
    T -->|Yes| AH
    U -->|Yes| AH
    X -->|Yes| AH
    Z -->|Yes| AH
    AE -->|Yes| AH
    AF --> AH
    E --> AH

    style V fill:#f9f,stroke:#333,stroke-width:2px
    style AA fill:#f9f,stroke:#333,stroke-width:2px
```

### Title Normalization

Before matching, titles undergo extensive normalization. The normalization
process includes:

1. **Whitespace normalization** - Remove non-breaking spaces, collapse multiple
   spaces
2. **Theatre performance standardization** - Handle "NT Live:", "Met Opera:",
   etc.
3. **Specific corrections** - Fix common misspellings and venue-specific quirks
4. **Prefix removal** - Strip "X presents:", "X selects:", etc.
5. **Suffix removal** - Strip Q&A mentions, screening types, dates
6. **Format removal** - Remove "3D", "IMAX", "Dubbed", etc.
7. **Diacritics removal** - Normalize Unicode characters
8. **Special character removal** - Remove emoji, punctuation, symbols

Examples of corrections:

| Input                           | Output                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| `Terminator 2 Live`             | `Terminator 2 Judgment Day`                                            |
| `Dr. Strangelove`               | `Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb` |
| `LOTR: The Two Towers`          | `The Lord of the Rings: The Two Towers`                                |
| `W&G: Curse Of The Were-Rabbit` | `Wallace & Gromit: The Curse Of The Were-Rabbit`                       |

### Matching Strategies

#### 1. Forced Matches

Some single-word or ambiguous titles are forced to specific TMDB IDs. This
handles cases where cinemas list movies with minimal information (e.g., just
"Elf" or "Notebook") that would otherwise fail to match or match incorrectly.
The forced matches map normalized titles to their known TMDB IDs.

#### 2. Director-Based Matching

If director information is available:

1. Search TMDB Person API for the director
2. Get their directing credits
3. Find a title match in their filmography

This is highly reliable for unique director-title combinations.

#### 3. Best Match Selection

When multiple TMDB results are returned, the `getBestMatch` function applies
filtering:

```mermaid
flowchart TD
    A[Raw Results] --> B{Single Result?}
    B -->|Yes| C{Has Crew Info?}
    C -->|No| D{Title Matches?}
    D -->|Yes| E[Return Result]
    C -->|Yes| F{Cast/Crew Match?}
    F -->|Yes| E
    F -->|No| G[Reject]

    B -->|No| H[Filter: Has Release Date]
    H --> I{≤3 Results & Has Crew?}
    I -->|Yes| J[Match by Cast/Crew]
    J -->|Match| E
    J -->|No Match| G
    I -->|No| K[Filter: Exact Title Match]

    K --> L{Single Result?}
    L -->|Yes| M{Has Crew Info?}
    M -->|No| E
    M -->|Yes| F

    L -->|No| N{Has Crew Info?}
    N -->|Yes| O[Try Cast/Crew Match]
    N -->|No| P{Has Matching Hints?}

    P -->|Yes| Q[Try Overview Match]
    Q --> R[Try Character Match]
    R --> S[Try Hint Cast Match]
    S --> T[Try Hint Crew Match]

    O -->|Match| E
    Q -->|Match| E
    R -->|Match| E
    S -->|Match| E
    T -->|Match| E

    P -->|No| G
    T -->|No Match| G
```

#### 4. Cast/Crew Verification

For ambiguous matches, the system fetches full movie details from TMDB and
compares the cast and crew against any known information from the cinema
listing. Director names are checked against crew credits, and actor names are
checked against cast credits. Names are normalized and compared with fuzzy
matching to handle variations (e.g., "Scott McGhee" vs "Scott McGehee"). A match
on any director or actor is sufficient to confirm the result.

#### 5. Matching Hints

Some transforms provide additional hints to aid matching:

- **overview** - Synopsis text to compare with TMDB overview
- **characters** - Character names mentioned in description
- **cast** - Possible cast names extracted from synopsis
- **crew** - Director or other crew names
- **year** - Release year if known

#### 6. LLM-Assisted Matching

When traditional matching fails, an LLM analyzes the listing:

1. **Review Results** - Ask LLM to pick the best match from TMDB results
2. **Identify Movie** - Ask LLM to identify the movie and provide additional
   data

The LLM can extract:

- Corrected movie title
- Release year
- Director/cast names
- Whether it's actually a movie (vs event, TV, etc.)

### Ignored TMDB IDs

Certain TMDB entries are explicitly ignored due to quality issues, including
low-quality entries, duplicates pending deletion, or entries with generic titles
that cause frequent mismatches (e.g., entries titled "Screening" or "Film
Festival"). These IDs are filtered out of all search results before matching is
attempted.

### Caching

All TMDB API responses are cached daily to:

- Reduce API calls
- Speed up repeat runs
- Handle API rate limits gracefully

---

## Error Handling

Each stage wraps operations in try-catch blocks and logs progress. The pipeline
outputs emoji-prefixed status messages showing success (✅) or failure (❌) for
each stage, along with timing and match statistics (e.g., "Matched 45/50 in
12s").

This provides:

- Clear progress indicators
- Timing information
- Match success rates
- Graceful error propagation

---

## Data Flow Example

Raw HTML/JSON scraped from a cinema website:

```json
{
  "filmTitle": "LOTR: The Two Towers (Extended) [12A]",
  "synopsis": "Peter Jackson's epic sequel. Frodo and Sam continue...",
  "runtime": "179 mins",
  "times": [
    { "date": "2026-02-10", "time": "19:00", "bookNow": "/book/abc123" }
  ]
}
```

After location-specific transform (standardized structure):

```json
{
  "title": "LOTR: The Two Towers (Extended)",
  "showingId": "example-cinema-lotr-extended",
  "url": "https://example-cinema.com/films/lotr-two-towers",
  "performances": [
    {
      "time": 1739217600000,
      "bookingUrl": "https://example-cinema.com/book/abc123"
    }
  ],
  "overview": {
    "directors": [],
    "actors": [],
    "year": null,
    "duration": 10740000,
    "classification": "12A"
  },
  "matchingHints": {
    "overview": "Peter Jackson's epic sequel. Frodo and Sam continue..."
  }
}
```

After full transform pipeline (matched and enriched):

```json
{
  "title": "LOTR: The Two Towers (Extended)",
  "showingId": "example-cinema-lotr-extended",
  "url": "https://example-cinema.com/films/lotr-two-towers",
  "performances": [
    {
      "time": 1739217600000,
      "bookingUrl": "https://example-cinema.com/book/abc123"
    }
  ],
  "overview": {
    "directors": [],
    "actors": [],
    "year": null,
    "duration": 10740000,
    "classification": "12A"
  },
  "themoviedb": {
    "id": 121,
    "title": "The Lord of the Rings: The Two Towers",
    "releaseDate": "2002-12-18",
    "summary": "Frodo and Sam are trekking to Mordor to destroy the One Ring..."
  },
  "category": "movie",
  "seen": 1738540800000
}
```

Note that `matchingHints` is removed from the final output after matching is
complete, as it's only used internally during the matching process.

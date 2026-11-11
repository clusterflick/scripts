# scripts

> **[Clusterflick](https://clusterflick.com)** is a free, open-source site
> listing every film showing in London, from 450+ venues in one search.
>
> This repository holds the code behind every stage of the data pipeline, with a
> module for each venue and ticketing source. See the
> [Clusterflick organisation](https://github.com/clusterflick) for how the
> pieces fit together.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and configure the following environment
   variables:

   | Variable                             | Description                                                                                     |
   | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
   | `MOVIEDB_API_KEY`                    | API key from [The Movie Database](https://www.themoviedb.org/settings/api)                      |
   | `GEMINI_API_KEY`                     | API key from [Google AI Studio](https://aistudio.google.com/app/apikey), for ordinary LLM calls |
   | `OPENAI_API_KEY`                     | OpenAI API key, needed by default: calls made with the capable model go to OpenAI               |
   | `TYPESAFE_API_KEY`                   | TypeSafe API key, only needed when `CATEGORISER=jev` or `MATCHER=jev`                           |
   | `CINEBUR_EMAIL` / `CINEBUR_PASSWORD` | A dedicated Cinebur account, needed to retrieve the `cinebur.com` source                        |
   | `PAT`                                | GitHub personal access token for accessing release data                                         |

   `.env.example` also lists the toggles that switch between interchangeable
   implementations (`LLM_PROVIDER`, `CAPABLE_LLM_PROVIDER`, `CATEGORISER`,
   `MATCHER`) and `IDENTIFY_BOT`. Each defaults to what production runs, so they
   can be left unset.

## Workflow

The typical data processing workflow is:

```
retrieve → transform-prepare → transform → combine → departed → match
                                   ↓
                                 diff + registry (compare two transform releases)
                                 cache (optional, speeds up combine)
```

1. **Retrieve** - Scrape raw data from cinema websites and external sources
2. **Transform prepare** - Build the inputs every venue's transform shares, once
   per run
3. **Transform** - Normalize data and match movies against TMDB
4. **Diff** - Compare two transform releases and record what changed
5. **Registry** - Record when each movie and venue was last seen
6. **Cache** _(optional)_ - Pre-cache TMDB data to speed up future combine runs
7. **Combine** - Merge all cinemas into a unified dataset with enriched metadata
8. **Departed** - List movies that have finished their run, so their pages
   survive
9. **Match** - Add ratings and links from external review sites

Outside the pipeline, **health** probes a chain's listing endpoint hourly, and
**llm-usage-report** summarises one transform run's LLM calls.

## Available Scripts

### Retrieve

This function retrieves data from supported cinemas and sources, and saves it as
a single JSON file.

To run this script:

```
# Internally
npm run retrieve <cinema|source>

# Externally
npx clusterflick/scripts retrieve <cinema|source>
```

Where `<cinema|source>` can be substituted for any cinema under `cinemas/` (e.g.
`princecharlescinema.com`) or source under `sources/` (e.g. `eventbrite.co.uk`)

Once complete, data will be saved as a JSON blob in the `retrieved-data/`
directory in a file named the same as the cinema or source used.

#### Example

Retrieving information from the Prince Charles Cinema

```
> $ npm run retrieve princecharlescinema.com

> scripts@1.0.0 retrieve
> TZ=Europe/London node index.js retrieve princecharlescinema.com

[🎞️  Location: princecharlescinema.com]
Retrieving data ...
 - ✅ Retrieved (1s)

> $ ls ./retrieved-data
princecharlescinema.com
```

### Transform

This function transforms retrieved data from supported cinemas, and saves it as
a single JSON file. See the
[Transform Pipeline documentation](./docs/transform.md) for detailed information
on how the transform process works.

ℹ️ **Note:** Before running this script, please make sure you have:

- Set up a `.env` file containing your Movie DB API key (`MOVIEDB_API_KEY`),
  Gemini API key (`GEMINI_API_KEY`) and OpenAI API key (`OPENAI_API_KEY`)
- retrieved the necessary cinema and source data using the `retrieve` script
  (above)
- prepared the inputs every cinema shares - the first-seen history, yesterday's
  release and what every source finds at every cinema - with
  `npm run transform-prepare`. It reads the last ten days of combined data from
  `combined-data/` if present (`./helpers/get-last-10-days-combined-data.sh`),
  and needs `PAT` to list releases. Run it once, then transform as many cinemas
  as you like

To run this script:

```
# Internally
npm run transform-prepare
npm run transform <cinema>

# Externally
npx clusterflick/scripts transform <cinema>
```

Where `<cinema>` can be substituted for any cinema under `cinemas/` (e.g.
`princecharlescinema.com`).

Once complete, data will be saved as a JSON blob in the `transformed-data/`
directory in a file named the same as the cinema used.

The data output will conform to the JSON schema defined in `./schema.json`

#### Example

Transforming information from the Prince Charles Cinema

```
> $ npm run transform princecharlescinema.com

> scripts@1.0.0 transform
> TZ=Europe/London node index.js transform princecharlescinema.com

[🎞️  Location: princecharlescinema.com]
Transforming data ...
 - ✅ Transformed (0s)
Matching data ...
 - ✅ Matched (218/227 in 1s)
Checking historical data ...
 - Found 3 new movies
 - ✅ Done (2s)
Categorising data ...
 - ✅ Categorised (1s)
Processing multiple-movies events ...
 - ✅ Processed 2 multi-movie events (0s)
Validating data ...
 - ✅ Validated (0s)

> $ ls ./transformed-data
princecharlescinema.com
```

### Combine

This function combines transformed data from all cinemas into a single unified
dataset. It enriches movies with additional metadata from TMDB (classification,
cast, crew, genres, trailers) and merges duplicate movies that appear across
multiple venues.

ℹ️ **Note:** Before running this script, please make sure you have:

- Set up a `.env` file containing your GitHub personal access token (`PAT`)
- Transformed data for all cinemas using the `transform` script

To run this script:

```
# Internally
npm run combine

# Externally
npx clusterflick/scripts combine
```

Once complete, data will be saved in `combined-data/combined-data.json`.

### Match

This function matches movies from the combined data against external review
sources to retrieve ratings and review URLs.

ℹ️ **Note:** Before running this script, please make sure you have:

- Combined data using the `combine` script

To run this script:

```
# Internally
npm run match <source>

# Externally
npx clusterflick/scripts match <source>
```

Where `<source>` can be one of:

- `rottentomatoes` - Match against Rotten Tomatoes
- `metacritic` - Match against Metacritic
- `letterboxd` - Match against Letterboxd
- `imdb` - Match against IMDb

Once complete, data will be saved in the `matched-data/` directory.

### Cache

This function pre-caches TMDB movie data for all transformed movies. This speeds
up subsequent combine runs by avoiding repeated API calls.

To run this script:

```
# Internally
npm run cache

# Externally
npx clusterflick/scripts cache
```

Once complete, cached data will be saved in two files:

- `cached-data/moviedb-data.json` - TMDB details keyed by movie id, read by both
  the combine and match stages.
- `cached-data/moviedb-collections.json` - TMDB collection details keyed by
  collection id, for the collections a movie belongs to. A movie's details name
  its collection but not the rest of the membership, so each one needs a second
  lookup.

### Diff

This function compares two releases of transformed data and records what changed
between them — venues added, removed and emptied; showings added, removed and
modified; and movie matches gained, lost and changed. Only performances still to
come are considered; a screening that has already happened dropping out of a
release is expected, not a change.

"Still to come" is measured against the current release's publish time, **not
the wall clock**, which is why that timestamp is a required argument. It keeps
the diff a pure function of its inputs: a re-run after a failure, or a run
repeated months later, reproduces the same result rather than quietly
reclassifying everything that has happened since as past. Pass the
`published_at` GitHub reports for the current release, in any format
`Date.parse` accepts.

Before running this script, place the two releases being compared in
`transformed-data/current` and `transformed-data/previous`.

To run this script:

```
# Internally
npm run diff -- <current-tag> <previous-tag> <current-published-at>

# Externally
npx clusterflick/scripts diff <current-tag> <previous-tag> <current-published-at>
```

Once complete, the change set will be saved in `diffed-data/diffed-data.json`.
**Nothing is written when the two releases are identical**, so a caller can use
the file's absence to skip publishing.

The same comparison backs `data-analysed`'s `compare:releases` report, so
behaviour changes belong here rather than in either consumer.

### Registry

This function records `lastSeen` for every TMDB id in the current transform
release, carrying forward ids that have stopped appearing, and `lastPerformance`
for every venue that has had one. It reads `transformed-data/current` and the
previous registry from `previous-registry/` (if present), and never the previous
transform release.

To run this script:

```
node index.js registry <current-tag>
```

Once complete, data will be saved in `diffed-data/seen-registry.json` and
`diffed-data/venue-registry.json`.

### Departed

This function lists movies the registry knows about that `combine` did not
produce - films that have finished their run - so the website can keep their
pages. Run it after `combine` and `registry`; it reads
`diffed-data/seen-registry.json`, `combined-data/combined-data.json` and
`cached-data/moviedb-data.json`.

To run this script:

```
node index.js departed
```

Once complete, data will be saved in `combined-data/departed-movies.json`,
separate from the combined data so nothing reading that sees films that aren't
screening.

### Health

This function probes a chain's listing endpoint without opening any per-title
page, and writes one row per venue describing what it saw. It takes a chain
group (e.g. `odeon.co.uk`) or a standalone venue that exports its own `health`
probe.

To run this script:

```
npm run health <group|venue>
```

Once complete, rows will be saved in `health-data/<group|venue>`. The rows are
written before the job fails, so a failed probe still leaves its evidence.

### LLM Usage Report

Every transform records its LLM calls to `llm-usage-data/<cinema>`. This
function folds a directory of those files - one transform run - into a single
report with totals, cache hit rate and estimated cost by call site and by venue.

To run this script:

```
npm run llm-usage-report <directory>
```

Once complete, the report will be saved in
`llm-usage-report/llm-usage-report.json` with a plain-text
`llm-usage-report/summary.txt`, which is also printed.

## Further Documentation

- [Adding a venue](./docs/adding-a-venue.md)
- [Retrieve pipeline](./docs/retrieve.md)
- [Transform pipeline](./docs/transform.md)
- [Occasions](./docs/occasions.md)
- [Accessibility](./docs/accessibility.md)
- [Reviewing title normalisation test cases](./docs/reviewing-title-normalisation-test-cases.md)

## Utility Scripts

These scripts help manage local data directories:

| Script                           | Description                                     |
| -------------------------------- | ----------------------------------------------- |
| `npm run clear:cache`            | Remove cached API and LLM responses             |
| `npm run clear:retrieved-data`   | Remove all retrieved data                       |
| `npm run clear:transformed-data` | Remove all transformed data and prepared inputs |
| `npm run clear:combined-data`    | Remove combined data                            |
| `npm run clear:matched-data`     | Remove matched data                             |
| `npm run clear:diffed-data`      | Remove diffed data                              |
| `npm run clear:llm-usage-data`   | Remove LLM usage data and reports               |
| `npm run clear:all`              | Remove all of the above                         |

## Helper Scripts

Scripts in the `helpers/` directory provide additional functionality for
development and debugging.

### Download Data from GitHub Releases

These scripts download data from the clusterflick GitHub repositories, useful
for local development without running the full pipeline:

| Script                                                        | Description                                               |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `./helpers/get-latest-retrieved-data.sh`                      | Download latest retrieved data from all cinemas           |
| `./helpers/get-latest-retrieved-data-for.sh <venue-id> ...`   | Download latest retrieved data for specific cinemas       |
| `./helpers/get-latest-transformed-data.sh`                    | Download latest transformed data from all cinemas         |
| `./helpers/get-latest-transformed-data-for.sh <venue-id> ...` | Download latest transformed data for specific cinemas     |
| `./helpers/get-latest-combined-data.sh`                       | Download latest combined dataset                          |
| `./helpers/get-last-10-days-combined-data.sh [dir] [days]`    | Download combined data from the last N days (default: 10) |

The `-for` variants take one or more venue ids (e.g. `thelexicinema.co.uk`) and
suggest close matches if an id isn't in the release. Use these to inspect what
the pipeline actually produced for a venue without downloading every venue.

**Requirements:** `curl`, `wget`, and `jq` (for the 10-days and `-for` scripts)

### Debugging Tools

#### run-matcher.js

Manually test the TMDB matching logic for a specific movie title:

```
node helpers/run-matcher.js "<title>" [year] [directors] [actors] [matchingHints]
```

**Examples:**

```bash
# Basic title search
node helpers/run-matcher.js "The Godfather"

# With year
node helpers/run-matcher.js "The Godfather" 1972

# With director
node helpers/run-matcher.js "The Godfather" 1972 "Francis Ford Coppola"

# With multiple actors (comma-separated)
node helpers/run-matcher.js "The Godfather" 1972 "" "Marlon Brando,Al Pacino"
```

#### highlight-hydration-misses-for-review.js

List all movies from transformed data that failed to match against TMDB, grouped
by title. Useful for identifying matching issues:

```
node helpers/highlight-hydration-misses-for-review.js
```

Output includes for each unmatched movie:

- Category (movie, event, multiple-movies, etc.)
- Normalized title and year
- TMDB search link
- Source URL
- Venues where it appears

Also displays a summary of unmatched entries grouped by category.

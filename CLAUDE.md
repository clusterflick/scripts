# CLAUDE.md

## Project Overview

Node.js data pipeline for aggregating, normalizing, and enriching cinema listing
data from over 300 cinema venues and 10 external ticketing sources. Data is
scraped, transformed, combined with TMDB metadata, and matched against review
aggregators (IMDb, Letterboxd, Rotten Tomatoes, Metacritic).

## Core Principles

- **Never invent data.** Do not make up URLs, IDs, API responses, or any other
  values. If data is unknown, ask or flag it — never guess.
- **Fail loudly over papering over issues.** If required data is missing, throw
  an exception. Do not silently default or fall back. A failing job is better
  than one that silently produces incorrect results.
- **Follow existing patterns.** When adding new code, follow the conventions and
  approaches already established in the codebase. Do not invent new patterns
  when existing ones work.

## Quick Reference

```bash
npm test               # Run tests (Jest, TZ=Europe/London)
npm run lint           # Run ESLint
npm run format         # Format with Prettier (JS, JSON, MD)
```

## Tech Stack

- **Runtime:** Node.js 24.13.0 (see `.node-version`)
- **Module system:** CommonJS (`require`/`module.exports`)
- **Testing:** Jest 29 with Polly.js for HTTP recording/replay
- **Linting:** ESLint 9 (flat config) + Prettier
- **Key libraries:** Cheerio (HTML parsing), Playwright (browser automation),
  date-fns, AJV (schema validation), moviedb-promise (TMDB API),
  @google/generative-ai (Gemini LLM)

## Project Structure

```
index.js                 # CLI entry point (retrieve|transform|combine|match|cache|diff|registry|departed|health)
cinemas/                 # 300+ cinema venue modules (each has attributes/retrieve/transform)
sources/                 # 9 external ticketing platform modules
common/                  # Shared utilities (utils.js, normalize-title.js, get-movie-data.js, etc.)
scripts/                 # Pipeline stages: retrieve/, transform/, combine/, match/, cache/, diff/,
                         #   registry/, departed/, health/
helpers/                 # Dev helper scripts (data download, manual matching)
docs/                    # Pipeline documentation (retrieve.md, transform.md)
schema.json              # JSON Schema for output validation
```

## Data Pipeline

```
retrieve  ->  transform  ->  combine  ->  match
(scrape)     (normalize,     (merge all    (find on IMDb,
              TMDB match,     cinemas,      Letterboxd,
              categorize)     enrich)       RT, Metacritic)
```

All pipeline commands run with `TZ=Europe/London`.

`diff` runs between `transform` and `combine`, comparing two `transform`
releases (`transformed-data/current` vs `transformed-data/previous`) to write
the change set published by `data-diffed`. `data-analysed`'s `compare:releases`
report renders the same comparison, so behaviour changes belong in
`scripts/diff/`, not in either consumer.

`registry` runs alongside it in the same job and publishes `seen-registry.json`:
`lastSeen` for every TMDB id in the current release, carried forward for ids
that have stopped appearing. It is a fold over one release plus its own previous
output — it never reads the previous `transform` release, so it stays correct
when the diff has nothing to report.

The same stage publishes `venue-registry.json` from the same pass over the
release: `lastPerformance` for every venue that had one, so a venue with nothing
on can still say when it last screened something. Two artifacts rather than two
keys — nothing is ever pruned from the venue registry (the movie retention
window is a work budget that does not apply), nothing reading one has to parse
the other, and only this one is safe for a backfill to rewrite. A venue that has
never had a performance gets no entry; its absence is the record. Nothing in
this repo consumes it: the website merges it onto its venues at build time, the
same way it merges the ratings out of `data-matched`.

`departed` runs after `combine` in the same job. Movies the registry knows about
that `combine` did not produce have finished their run, and it writes them to
`combined-data/departed-movies.json` so the website can keep rendering pages
that would otherwise 404. It writes a separate artifact deliberately: nothing
reading `combined-data.json` — the match stage, the client payload, the listings
— should see films that aren't screening.

`health` sits outside the pipeline. It probes a chain's listing endpoint,
asserts the response is healthy and writes one row per venue to
`health-data/<group>` - it never opens a per-title page, so the whole Odeon
estate costs 2 requests against a retrieve's 323, cheap enough to run hourly.
Its unit is a chain group (the id prefix the venues share) rather than a venue,
because one batched call can answer for all of them; a standalone venue can
carry its own probe as an optional `health` export beside `retrieve` and
`transform`. A group whose venues sit on separate domains - Castle and Olympic
Studios - has no id prefix and nothing to batch, so each venue exports the
`health` its siblings share from `common/<chain>/health.js`, one line apiece.

What a chain can count varies, and the row's `granularity` says which: Odeon,
Curzon and Cineworld give a film x date matrix (`film-date`), while Picturehouse,
Vue, Electric, Castle, Admit One and Olympic Studios return individual showings
(`performance`). `byDate` is the same axis either way - films per date, or
performances per date - so a publish reads the same everywhere: new keys
appearing, or existing keys growing. Omniplex is the exception, and says so with
a third value: it publishes one date at a time, so its film x date matrix costs a
request per published date - 54 at Sutton - which is what the retrieve pays and
too much to repeat hourly. Its probe counts the two axes rather than their
product (`film-and-date-totals`), reports no `byDate` at all rather than one
built from a fraction of the dates, and a publish there reads as either total
growing. Each probe checks the chain's own site list before asking for listings -
that is what separates a venue with nothing on from an id that has gone stale;
some chains answer a stale id with that list instead of a 404, which does the
same job. These endpoints are quirkier than they look, and each probe documents
its own traps at the top of `common/<chain>/health.js`: read it before changing a
call or a parameter.

A bot challenge is retried once after about a minute before it is recorded,
because a challenge that clears was never worth a row - the point is complete
data, not a note explaining a hole in it. Only challenges are retried; a missing
venue or a broken parse fails the same way twice. For the browser probes the
retry recreates the session, since a challenged context stays challenged.

Its rows are written before the job is allowed to fail. A bot challenge or a
venue with nothing on is an observation about the source and the evidence the
log exists to keep, so it is recorded and the job stays green; an unknown venue
id or a failed probe is recorded too, and then the job goes red.

The exception is a venue declared shut in `common/expected-closures.js`, which
the probe reads for the same reason `transform` does. A chain drops a closed
venue from its own site list as readily as it empties its listings, so for the
length of the closure the check that catches a stale id catches the closure
instead - a week of expected red in which a real breakage would look identical.
Those two kinds are re-labelled `expected-closure` for a declared venue and the
job stays green; the row keeps what was actually seen under `observed`. Nothing
else is excused - a challenge or a broken probe says nothing about whether the
doors are open.

`llm-usage-report` is the diagnostic side-channel, not a pipeline stage. Every
`callLlm` records its cache hit and token usage to `common/llm-usage-log.js`,
which is process-scoped - so one `transform <location>` invocation collects
exactly one venue's calls, written to `llm-usage-data/<location>` beside the
transformed output. A separate artifact for the same reason
`departed-movies.json` is one: nothing that reads cinema listings should carry
LLM diagnostics. `llm-usage-report <directory>` then folds a day's worth of
those files into one report - totals, cache hit rate, and estimated cost by call
site and by venue - plus a plain-text summary meant to be read rather than
parsed.

Cost is estimated from the listed prices in `common/llm-pricing.js`, each cited
with the date it was checked. A model with no listed price is named in
`metadata.modelsWithoutPricing` rather than costed at zero, so the report says
it is undercounting instead of quietly doing it. Add the price when a new model
starts being called.

The report is a snapshot of one transform run and folds nothing across runs -
and the pipeline goes several times a day, so a day's usage is a sum over its
runs rather than any single report. The series lives in `data-analysed`, which
collects each run's report into `llm-usage-log.jsonl` on a monthly release - so
a question about a trend is answered there, and a question about which venue
drove one run's number is answered by that run's report, for the fortnight its
artifact survives. Nothing in this repo reads either back.

## Module Pattern

Every cinema/source module exports the same interface:

```javascript
module.exports = {
  attributes, // { id, name, domain, url, address, geo, structure, type, programming }
  retrieve, // async () => raw data from venue website
  transform, // async (retrievedData) => normalized listings
};
```

## Testing Conventions

- Each cinema module has `tests/index.test.js` with HTTP recordings in
  `__recordings__/`
- Tests use Polly.js to record and replay HTTP interactions (sensitive headers
  redacted)
- Test timezone is always `Europe/London`
- Schema validation via AJV against `schema.json`
- Shared test utilities in `common/test-utils.js`

### Source Test Pattern

Source tests follow a specific structure. Use `sources/bbk.ac.uk/tests/` as the
reference implementation. Key rules:

- **`describe.each` with retrieve inside each `it()` block.** Each test case
  calls `retrieve()` then `findEvents()`. Polly replays the same HAR recordings
  for each case. **Never use `beforeAll` for network calls** — Polly only
  intercepts fetch inside `it()` blocks (the Polly instance is created on
  `test_start`). Code in `beforeAll` bypasses Polly entirely and hits real
  servers silently.
- **Specific assertions on retrieved data.** Use `toHaveLength(n)` with exact
  counts for retrieved data (e.g. `Object.keys(moviePages)`). Never use
  `toBeGreaterThan` — vague assertions hide regressions.
- **Recordings must exist before the test is considered done.** Tests with
  `isRecording = false` replay from HAR files in `__recordings__/`. If that
  directory is empty or missing, the test is broken. When writing a new source
  test:
  1. Write the test file with `isRecording = true`
  2. Tell the user to run it to generate HAR recordings
  3. Verify `__recordings__/` was created and contains `.har` files
  4. Flip `isRecording` back to `false`
- **Always look at multiple existing source tests** before writing a new one. Do
  not copy from a single example — it may itself be non-standard.

## Environment Variables

Defined in `.env.example`:

- `MOVIEDB_API_KEY` - The Movie Database API key
- `GEMINI_API_KEY` - Google Gemini API key
- `PAT` - GitHub personal access token

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- Runs on push/PR to main
- Steps: install (`npm ci`) -> lint -> test
- Daily workflow updates test title data automatically

## Key Files

- `common/utils.js` - Core shared utilities (retries, text processing, data
  helpers)
- `common/normalize-title.js` - Extensive movie title normalization (31KB)
- `common/get-movie-data.js` - TMDB API integration and caching
- `common/ask-llm.js` - Gemini LLM client for categorization
- `scripts/transform/index.js` - Main transformation orchestrator
- `scripts/combine/index.js` - Data merging and TMDB enrichment

## Title Normalisation Files

Two files handle title normalisation. Know which to edit:

- **`common/normalize-title.js`** — corrections (spelling fixes, encoding,
  unicode, Roman numerals, etc.) and structural rules. Add here when fixing how
  a title is _written_.
- **`common/known-removable-phrases.js`** — string phrases to strip (venue
  series names, event descriptors, screening qualifiers). Add here when removing
  a _label_ a cinema wraps around a film title.

When adding an entry to either file, **also add a test case to
`common/tests/test-titles.json`**:

```json
{ "input": "Film Club: Some Film", "output": "some film" }
```

Do not add near-identical variants of an existing phrase as separate strings in
`known-removable-phrases.js` — raise a PR to convert the family to a regex
pattern in `normalize-title.js` instead.

Both files feed the _grouping key_, not the displayed title: `combine` stores
`normalizedTitle` to decide which listings are the same film, and keeps each
venue's own title for display. When the fix is to how a title _reads_ rather
than what it matches, it belongs on the display side —
`common/strip-serial-block-suffix.js` is the example, rewriting a merged film's
title while each showing keeps the specific one the venue gave it.

## Common Categories

Listings are categorized as: `movie`, `multiple-movies`, `tv`, `quiz`, `comedy`,
`music`, `talk`, `workshop`, `shorts`, `event`.

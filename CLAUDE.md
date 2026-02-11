# CLAUDE.md

## Project Overview

Node.js data pipeline for aggregating, normalizing, and enriching cinema listing data
from 240 cinema venues and 9 external ticketing sources. Data is scraped,
transformed, combined with TMDB metadata, and matched against review aggregators
(IMDb, Letterboxd, Rotten Tomatoes, Metacritic).

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
index.js                 # CLI entry point (retrieve|transform|combine|match|cache)
cinemas/                 # 240 cinema venue modules (each has attributes/retrieve/transform)
sources/                 # 9 external ticketing platform modules
common/                  # Shared utilities (utils.js, normalize-title.js, get-movie-data.js, etc.)
scripts/                 # Pipeline stages: retrieve/, transform/, combine/, match/, cache/
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

## Module Pattern

Every cinema/source module exports the same interface:

```javascript
module.exports = {
  attributes,   // { id, name, domain, url, address, geo, structure, type }
  retrieve,     // async () => raw data from venue website
  transform,    // async (retrievedData) => normalized listings
};
```

## Testing Conventions

- Each cinema module has `tests/index.test.js` with HTTP recordings in `__recordings__/`
- Tests use Polly.js to record and replay HTTP interactions (sensitive headers redacted)
- Test timezone is always `Europe/London`
- Schema validation via AJV against `schema.json`
- Shared test utilities in `common/test-utils.js`

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

- `common/utils.js` - Core shared utilities (retries, text processing, data helpers)
- `common/normalize-title.js` - Extensive movie title normalization (31KB)
- `common/get-movie-data.js` - TMDB API integration and caching
- `common/ask-llm.js` - Gemini LLM client for categorization
- `scripts/transform/index.js` - Main transformation orchestrator
- `scripts/combine/index.js` - Data merging and TMDB enrichment

## Common Categories

Listings are categorized as: `movie`, `multiple-movies`, `tv`, `quiz`, `comedy`,
`music`, `talk`, `workshop`, `shorts`, `event`.

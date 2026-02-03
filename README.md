# Scripts

Common scripts for managing cinema data

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and configure the following environment
   variables:

   | Variable          | Description                                                                |
   | ----------------- | -------------------------------------------------------------------------- |
   | `MOVIEDB_API_KEY` | API key from [The Movie Database](https://www.themoviedb.org/settings/api) |
   | `GEMINI_API_KEY`  | API key from [Google AI Studio](https://aistudio.google.com/app/apikey)    |
   | `PAT`             | GitHub personal access token for accessing release data                    |

## Workflow

The typical data processing workflow is:

```
retrieve → transform → combine → match
                ↓
              cache (optional, speeds up combine)
```

1. **Retrieve** - Scrape raw data from cinema websites and external sources
2. **Transform** - Normalize data and match movies against TMDB
3. **Combine** - Merge all cinemas into a unified dataset with enriched metadata
4. **Match** - Add ratings and links from external review sites
5. **Cache** _(optional)_ - Pre-cache TMDB data to speed up future combine runs

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

- Set up a `.env` file containing your Movie DB API key (`MOVIEDB_API_KEY`) and
  Gemini API key (`GEMINI_API_KEY`)
- retrieved the necessary cinema and source data using the `retrieve` script
  (above)

To run this script:

```
# Internally
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

Once complete, cached data will be saved in `cached-data/moviedb-data.json`.

## Utility Scripts

These scripts help manage local data directories:

| Script                           | Description                 |
| -------------------------------- | --------------------------- |
| `npm run clear:cache`            | Remove cached API responses |
| `npm run clear:retrieved-data`   | Remove all retrieved data   |
| `npm run clear:transformed-data` | Remove all transformed data |
| `npm run clear:combined-data`    | Remove combined data        |
| `npm run clear:matched-data`     | Remove matched data         |
| `npm run clear:all`              | Remove all of the above     |

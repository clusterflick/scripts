# Scripts

Common scripts for managing cinema data

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

Retriving information from the Prince Charles Cinema

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

This function transforms retriueved data from supported cinemas, and saves it as
a single JSON file.

ℹ️ **Note:** Before running this script, please make sure you have:

- Set up a `.env` file containing your Movie DB API key (`MOVIEDB_API_KEY`)
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
Validating data ...
 - ✅ Validated (0s)

> $ ls ./transformed-data
princecharlescinema.com
```

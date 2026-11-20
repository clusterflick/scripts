# Venue accessibility

A standard accessibility section for every venue page, built from cited, trusted
sources, and later a venue filter built on it. This is about the **building and
its screens**. What each screening offers (subtitles, audio description,
relaxed, dog-friendly) is `performance.accessibility`, documented in
`docs/accessibility.md`, and out of scope here.

## What's here

| Path                                    | What it is                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `accessibility/venues/<venue-id>.json`  | One record per venue in scope: the reviewed data                               |
| `accessibility/sources.json`            | The source registry: the pages each venue's facts are read from                |
| `common/accessibility/schema.json`      | The record's shape                                                             |
| `common/accessibility/validate.js`      | The rules below, plus publication and quote checks                             |
| `common/accessibility/source-policy.js` | The source policy table, in code                                               |
| `common/accessibility/page-text.js`     | A page reduced to text, its hash, and quote matching                           |
| `scripts/accessibility/`                | Fetching the registry and detecting changed pages                              |
| `helpers/import-accessibility-seed.js`  | The one-off import of the desk-research seed (`venue-accessibility-seed.json`) |

```bash
TZ=Europe/London node index.js accessibility-validate  # records, rules, and quotes if pages were fetched
TZ=Europe/London node index.js accessibility-fetch     # every registered page into accessibility-pages/
```

**The data is committed, not released.** Every change to it is a fact someone
has to approve, so a pull request against `accessibility/` is the review queue:
the diff is what's new or changed, the merge is the approval.
`common/accessibility/tests/records.test.js` validates the committed data, so CI
refuses a record that breaks the rules. The website reads the files from `main`,
as it already reads `schema.json`.

## Scope

A venue is in scope when its `programming` is `cinema` (film is the programme)
or `venue` (film is a regular part of it). `host` venues, which let other
people's screenings in now and then, are out. That is `isInScope` in
`validate.js`, and `validateAll` fails when a venue in scope has no record, so a
new cinema can't go without one unnoticed.

That was 153 venues on 20 November 2026. The seed covered 142 of them, the
seed's "cinema" and "arts venue" being exactly `cinema` and `venue`. The other
11 were imported as all-unknown stubs: the outdoor and seasonal screens (Rooftop
Peckham and Stratford, Backyard Cinema, Canary Wharf Summer Screens, London
Bridge City, Adventure Cinema Kew Gardens), Everyman on the Canal, Southbank
Centre, Alexandra Palace, Mosaic Rooms and the Museum of Youth Culture.

## Records

One record per venue, keyed by **venue id** and named after it. The seed was
keyed by the website's slug, which is `slugify(venue.name)` and changes when a
venue is renamed. The slug, name, kind and Clusterflick URL are all derived from
the venue's attributes, so they aren't stored.

Every fact is a field object:

```json
{
  "status": "yes | no | partial | unknown | not_applicable",
  "note": "Short plain-English detail, e.g. 'Ramp from street'",
  "sources": [
    {
      "url": "https://…",
      "tier": 1,
      "source_last_updated": "2026-09-16",
      "checked_on": "2026-11-20",
      "quote": "Exact supporting text from the page",
      "chain_wide": false
    }
  ],
  "conflict": "null, or a description of the disagreement between sources",
  "last_found": {
    "claim": "…",
    "url": "…",
    "tier": 3,
    "found_on": "2026-11-20"
  }
}
```

`wheelchair_spaces` adds `count` (an integer, or `null` if not stated) and
`space_position` adds `value` (`front | middle | rear | mixed | unknown`).
`chain_wide` is optional and marks a policy stated for the whole chain.

Venue fields: `entrance_step_free`, `alt_accessible_entrance`, `lift`
(`not_applicable` if single level), `accessible_toilet`, `changing_places`,
`assistance_dogs`, `quiet_space` and `hearing_assist_counters`, beside `id`,
`access_page_url`, `access_contact`, `coverage`, `verified`, `researched_on` and
`notes`.

Screen fields: `name`, optional `aliases`, `step_free`, `wheelchair_spaces`,
`space_position`, `transfer_seating`, `hearing_assist` (note the type: induction
loop, infrared, Dolby Fidelio, none) and `notes`.

### Rules

`validateRecord` holds every record to these, verified or not:

1. **Never infer.** A status other than `unknown` needs a source. "Unknown" is a
   valid, publishable answer.
2. **A status comes only from tier 1 or 2.** The schema allows nothing else in
   `sources`.
3. **Tier 3 goes in `last_found`**, and only on a field whose status is
   `unknown`. The page shows it as "We don't know. The last report we found
   said…", with its source and date.
4. **Conflicts are kept.** Both sources stay in `sources` and `conflict` says
   how they disagree. Nothing picks one automatically.
5. **Chain-wide policies count for the venue, never for a screen.** A screen
   field with a `chain_wide` source fails.
6. **Every published fact has a quote** (`getPublicationBlockers`), and every
   quote must still be on its page (`findMissingQuotes`).

A count must agree with its status (a count under `unknown`, 2 spaces under
`no`, or 0 under `yes` fails), and so must a position.

**Only a verified record is published**, and verifying needs a quote for every
source. Conflicts don't block publication, since the page shows "Sources
disagree" with both, but they do need a reviewer to have looked.

## Source policy

| Tier     | Use               | Sources                                                                                                                                                                                                                                                                                |
| -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Fact              | The venue's own site (access page, FAQ, access PDFs, visual story guides); the chain's page for that venue                                                                                                                                                                             |
| 2        | Fact, show date   | AccessAble guides; the Changing Places map (changing-places.uk); council Local Offer pages; Nimbus Access Card listings; Euan's Guide venue information (not reviews); Accessible Screenings UK venue information, if it publishes any                                                 |
| 3        | `last_found` only | Euan's Guide reviews; festival or event-organiser access pages (e.g. Open City Docs)                                                                                                                                                                                                   |
| Excluded | Never             | Aggregators and listings: Tagvenue, Hire Space, TripAdvisor, Tripability, accesstolondon, Cinematik, Eventim listings, Grokipedia and other wiki clones, Google-derived listings, third-party event listings, old mirror copies of chain sites (e.g. thetunagroup, www1.picturehouses) |

`source-policy.js` is this table in code, and it **fails closed**: a host it
doesn't list is an error, not a tier. Add a host there before a record uses it.
Tier 1 is the hosts in the venue's `domain` and `url`, plus `OWN_HOSTS` for the
chain sites and help desks that publish for a venue from elsewhere (BFI's
`bfi.org.uk` beside `whatson.bfi.org.uk`, Everyman's Freshdesk, Olympic
Studios). Hosts are compared exactly, never by registrable domain, so
`www1.picturehouses.com` can't pass as the chain's site.

A source may be given a lower tier than the policy allows, never a higher one.
The seed cites a Euan's Guide venue page at tier 3 for something its reviews
said, and that's right.

AccessAble surveys can be years old. Record the survey date in
`source_last_updated` where the guide shows it, and if a newer tier 1 source
disagrees, record the conflict rather than preferring either.

## Where each chain publishes, as found

Measured on 20 November 2026, fetching from a cloud container, not a self-hosted
runner.

| Chain        | Venues | Where                                                            | Found                                                                                                                                                                                                                                                                                               |
| ------------ | ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picturehouse | 11     | `<attributes.url>/accessibility`, in `.cinimaAccessibility_div`  | **Not a regular template.** Only Central has the "Physical Access in our Screens" block; the rest are prose that differs per venue (Ealing lists seat numbers, the Ritzy gives counts in a sentence). Greenwich currently says Screen 5 has no step-free access. All 11 fetch with a plain request. |
| Vue          | 15     | `myvue.com/cinema/<slug>/whats-on`                               | 403 to a plain fetch. The listings retrieve already goes through Playwright, so this will too.                                                                                                                                                                                                      |
| ODEON        | 19     | `accessable.co.uk/odeon/access-guides/<slug>`                    | 403 to a plain fetch, as is all of accessable.co.uk                                                                                                                                                                                                                                                 |
| Everyman     | 16     | `everymanmedia.freshdesk.com/…/<id>-<venue>-accessibility-guide` | Freshdesk answers a plain fetch. Article ids still need discovering for 13 venues.                                                                                                                                                                                                                  |
| Curzon       | 10     | `curzon.com/venues/<slug>`                                       | 403 to a plain fetch                                                                                                                                                                                                                                                                                |
| Cineworld    | 12     | `cineworld.co.uk/cinemas/<id>`                                   | Not yet checked                                                                                                                                                                                                                                                                                     |
| Others       | 70     | Their own access pages; AccessAble as backup                     | Close-Up, BFI's whatson pages and the Hackney Local Offer refused a plain fetch; the rest of the seed's sources answered                                                                                                                                                                            |

So the fetch has to run where the listings retrieve runs, with the same
escalation: `getPageEscalating` (`common/camoufox-escalation.js`) for the pages
that refuse us, which only the self-hosted runners can do.

## Screens and the listings

Whether "this showing is in a step-free screen" is possible depends on the
listings carrying a screen. `performance.screen` is already in `schema.json`,
and in the 20 November release, of the 153 venues:

- 55 give every performance a screen, and 25 give some: nearly all of ODEON (18
  of 19), Vue (12 of 15), Curzon and Picturehouse (7 of 10 and 7 of 11), both
  Electrics, Rio, ICA, Barbican, the BFI.
- **None of Cineworld's 12 or Everyman's 16** venues give a screen.

The names mostly line up already, because transforms pass the venue's screen
through `getScreen` (`common/utils.js`), which turns "Screen 1" and "NFT1" into
"1". Applying `getScreen` to a record's screen names matches the listings for
Vue ("Screen 1" and "1", "EPIC 1" on both sides), Picturehouse, Rio, Lexi,
Castle, Chiswick and BFI Southbank. Cases that need an `aliases` entry: Olympic,
whose listings name one screen "Olympic Studios" against three on the access
page; the Phoenix and Regent Street, where the seed has one "Cinema" but the
listings number them; and BFI IMAX ("IMAX" and "BFI IMAX"). Listings also name
rooms that aren't screens (Rio's "Ludski", BFI's "Blue Room"), so a listing
screen with no record is unknown, never "no".

The first filter, "has at least one step-free screen with a wheelchair space",
needs none of this, and is the one to build first.

## Fetching and change detection

`accessibility-fetch` fetches every page in `accessibility/sources.json`,
reduces it to text (narrowed to the entry's `selector`, where it has one), and
compares each page's hash with `accessibility/page-hashes.json`. A new or
changed page sends its venue back for review. A failed page is recorded and the
rest carry on; the step fails afterwards, with the pages that did come back
already written to `accessibility-pages/`.

The hash is over the text, and only the access copy where a selector is given,
because chain pages wrap that copy in the site template: Picturehouse's carries
the venue's film carousel, which would change the hash every day. A selector
that doesn't match exactly one element throws, since the template has changed.

`accessibility-validate` then checks every quote against those pages.

## The seed

`helpers/import-accessibility-seed.js` imported `venue-accessibility-seed.json`
on 20 November 2026. **Nothing in it is verified**: research captured no quotes,
so every record imported unverified and every source with `quote: null`, and
none of it can reach the website until each fact is checked against its page. 0
of 153 records are publishable.

The import matched seed entries to venues by exact name (all 142 matched one
venue each), and validating the result caught values filed under the wrong
field, which the import didn't move, since which field was meant is a guess.
Each was reset to unknown with what the seed said kept in the screen's `notes`:

- Arthouse Crouch End and Close-Up: a wheelchair-space count under `step_free`.
- Genesis Screens 2 and 3: a `front` position under `wheelchair_spaces`.

Conflicts the seed recorded: Rio Screen 1 spaces (2 vs 3), ICA Cinema 1 and 2
spaces, the Phoenix (4 vs 2), the David Lean (3 vs 2), the Genesis lift (none,
stair-climber or platform lift), the Prince Charles (FAQ says no disabled
access, the access page describes a ramp) and BFI Southbank's hearing loops.
Finsbury Park's page conflicts with itself but isn't recorded as a conflict.
Picturehouse Central's does too: Screen 2 has "No. of wheelchair spaces: 2" and
lists three seats.

Time-sensitive: the Garden Cinema's Screen 3 platform lift was out of service
when checked, the Castle's lift planning appeal is pending, and Greenwich
Picturehouse's Screen 5 currently has no step-free access. Vue Piccadilly rests
on an Access Card listing alone.

## Still to build

1. **The fetch job**: a workflow on a self-hosted runner, monthly, running
   `accessibility-fetch` with Camoufox escalation for the pages that refuse a
   plain fetch, and opening a pull request with the changed hashes and the
   venues to review.
2. **Extraction**: an LLM reads a page's text against the schema and must return
   a quote for every field it doesn't leave unknown, through `callLlm`.
   Picturehouse goes here rather than to a parser, since its pages aren't a
   template. A chain parser is only worth writing once a chain is shown to be
   regular. Its output is checked with `validateRecord` and `findMissingQuotes`,
   and it goes into a pull request, never straight onto `main`.
3. **Sources**: Everyman's Freshdesk article ids, ODEON's AccessAble slugs,
   Curzon, Cineworld, and the stubs.
4. **Staleness**: a fact not re-confirmed in 12 months shown as stale.
5. **The website**: the venue page section, then the first filter.

For venues that publish nothing, keep an `access_contact` and ask for the
per-screen details in the schema.

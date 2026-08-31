# Health Checks

The health check sits outside the pipeline. It asks a venue's listing endpoint
what is currently published, writes one row per venue to `health-data/<group>`,
and never opens a per-title page -- which is what keeps it cheap enough to run
hourly, where a [retrieve](./retrieve.md) is not.

```bash
npm start health <location>   # a chain group, or a single venue
```

## What a row is answering

Two questions, and neither of them needs an exact census of the listings:

1. **Is the source still answering with a programme?** A broken listing, a
   renamed selector, a bot challenge, a holding page, a venue id that has gone
   stale -- these are the failures a retrieve would otherwise discover once a
   day, at full cost.
2. **Did the source publish?** A new film appearing, or a new date opening, is a
   strong enough signal that something changed. The probe does not need to
   reproduce what `transform` will publish; it needs to move when the source
   moves.

That framing is why several probes report totals rather than a full matrix. A
probe that costs a request per date to build a perfect picture is a probe that
cannot run hourly, and an hourly rough signal beats a daily exact one.

## What a probe can see

The row's `granularity` says what that venue's endpoint could be asked cheaply.
Four values, strongest first:

| Granularity            | Venues | New film | New date | More showings of a film already on that date | `byDate` |
| ---------------------- | -----: | :------: | :------: | :------------------------------------------: | :------: |
| `performance`          |     75 |    ✅    |    ✅    |                      ✅                      |    ✅    |
| `film-date`            |     41 |    ✅    |    ✅    |                      ❌                      |    ✅    |
| `film-and-date-totals` |      3 |    ✅    |   ✅\*   |                      ❌                      |    ❌    |
| `film-totals`          |     13 |    ✅    |    ❌    |                      ❌                      |    ❌    |

\* Metro Cinema yes; Lumiere Romford's date count is capped -- see
[Known blind spots](#known-blind-spots).

`byDate` is the same axis either way -- films per date, or performances per date
-- so where it exists a publish reads the same everywhere: new keys appearing,
or existing keys growing.

## Coverage

|                                                 |  Venues |
| ----------------------------------------------- | ------: |
| Cinema modules                                  |     409 |
| Source-only (no endpoint of their own to probe) |     250 |
| **Eligible for a health check**                 | **159** |
| **Covered**                                     | **132** |
| Remaining                                       |      27 |

`bfi.org.uk-stephen-street` sits under a chain prefix but is source-only, and
the BFI probe excludes it by name; the BFI row count is 2, not 3.

## The probes

Cost is what the probe spends, against what the same listing costs a retrieve.

### `performance` -- individual showings, with a date on each

| Probe                                       | Venues                                       | Cost                                                                                 |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `common/everymancinema.com/health.js`       | 17 Everyman venues                           | 2 requests for the estate                                                            |
| `common/myvue.com/health.js`                | 15 Vue venues                                | 1 browser page load plus a request per venue                                         |
| `common/picturehouses.com/health.js`        | 11 Picturehouse venues                       | 3 requests for the estate                                                            |
| `common/savoysystems.co.uk/health.js`       | Rio, Phoenix, the Lexi, the Arzner           | 1 request each, against a retrieve's 30--50                                          |
| `common/indycinemagroup.com/health.js`      | ActOne, Chiswick, Regent Street              | 1 request each (the retrieve's own cost; the saving is 15KB against several hundred) |
| `common/olympicstudios.com/health.js`       | Olympic, Selfridges, the Power Station       | 1 request each                                                                       |
| `common/tribe-events/health.js`             | Coldharbour Blue, Lyric Square, Stanley Arts | 3--4 requests each, against Coldharbour's retrieve of 42                             |
| `common/bfi.org.uk/health.js`               | BFI IMAX, BFI Southbank                      | 1 page load a venue                                                                  |
| `common/thecastlecinema.com/health.js`      | Castle Hackney, Castle Sidcup                | 1 request each                                                                       |
| `common/admit-one.co.uk/health.js`          | Genesis, Forest                              | 1 request each, against a retrieve's forty-odd                                       |
| `common/electriccinema.co.uk/health.js`     | Portobello, White City                       | 1 request for both                                                                   |
| `common/rooftopcinemaclub.com/health.js`    | Peckham, Stratford                           | 7 and 4 requests -- the listing walk only                                            |
| `cinemas/princecharlescinema.com/health.js` | Prince Charles                               | 1 request (the retrieve's own; it avoids the transform)                              |
| `cinemas/thegardencinema.co.uk/health.js`   | the Garden Cinema                            | 1 request, against a retrieve's 103                                                  |
| `cinemas/thenickel.co.uk/health.js`         | the Nickel                                   | 1 request, against a retrieve's 74                                                   |
| `cinemas/jw3.org.uk/health.js`              | JW3                                          | 3 requests, against a retrieve's 45                                                  |
| `cinemas/ica.art/health.js`                 | the ICA                                      | 1 request, against a retrieve's 41                                                   |
| `cinemas/riversidestudios.co.uk/health.js`  | Riverside Studios                            | 1 request, against a retrieve's 38                                                   |
| `cinemas/wiltons.org.uk/health.js`          | Wilton's Music Hall                          | 2 requests -- the listing walk only                                                  |
| `cinemas/curzonseacontainers.com/health.js` | Curzon Sea Containers                        | 1 request (the retrieve's own; it avoids the transform)                              |
| `cinemas/sciencemuseum.org.uk/health.js`    | the Science Museum                           | 1 request, against a retrieve's 13                                                   |

### `film-date` -- a film x date matrix, no showing counts

| Probe                              | Venues              | Cost                                                            |
| ---------------------------------- | ------------------- | --------------------------------------------------------------- |
| `common/ocapi-v1/health.js`        | 19 Odeon, 10 Curzon | 2 requests for the whole Odeon estate, against a retrieve's 323 |
| `common/cineworld.co.uk/health.js` | 12 Cineworld venues | 1 request a venue plus one chain check                          |

These chains publish a screening's dates but not its showtimes; the showtimes
call costs a request per date, which is the cost the probe exists to avoid.

### `film-and-date-totals` -- the two axes, not their product

| Probe                             | Venues                 | Cost                                                  |
| --------------------------------- | ---------------------- | ----------------------------------------------------- |
| `common/omniplex.co.uk/health.js` | Omniplex Sutton        | 2 requests a venue, against a retrieve's 55           |
| `common/cinesync.io/health.js`    | Lumiere Romford, Metro | 2 requests a venue, against Lumiere's retrieve of 256 |

Both publish one date at a time, so a per-date breakdown costs a request per
published date -- 54 at Sutton, 256 at Lumiere. Their probes report the film
total and the date total and no `byDate`, rather than a `byDate` built from a
fraction of the dates.

### `film-totals` -- films only, no date axis

Every one of these was checked for a date axis before it was written this way;
each probe says in its own comment what it found. All but the Barbican share
`common/listing-totals-health.js`, which reads a venue's listing pages and
counts the distinct entries linked from them -- the mechanics are identical, the
reason for reaching for them is not.

| Probe                                        | Venues               | Cost                                 | Why no dates                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cinemas/barbican.org.uk/health.js`          | the Barbican         | 5 requests, against a retrieve's 160 | Listing cards carry an id, a title and a blurb -- no date in any form. The site's day filter takes one date at a time, and there is no JSON API behind the listing.                                               |
| `common/tate.org.uk/health.js`               | Tate Britain, Modern | 1 request each, against 6            | Cards carry the event's _start_, written nine ways across the programme ("15 Oct 2026", "Until 31 Aug 2026", "Ongoing"). The transform reads the run off the event page and expands it to a performance a day.    |
| `cinemas/peckhamplex.london/health.js`       | Peckhamplex          | 2 requests, against 35               | A working cinema whose listing carries none of its schedule: the film page's `film-by-times` panel is empty in the served HTML and filled by script, so reaching it would mean a browser per cycle.               |
| `cinemas/institut-francais.org.uk/health.js` | Ciné Lumière         | 1 request, against 22                | Cards carry `card__dates`, but 56 of 59 read "From 29 Aug" -- a start with no end -- and the rest are date lists. Neither says which days a film plays.                                                           |
| `cinemas/kilntheatre.com/health.js`          | Kiln Theatre         | 1 request, against 12                | Titles and links, with no date or time markup anywhere on the cinema listing.                                                                                                                                     |
| `cinemas/arthousecrouchend.co.uk/health.js`  | ArtHouse Crouch End  | 2 requests, against 7                | Savoy-ticketed, but its Savoy backend serves a browser shell with no `var Events` blob, and its booking-now page has no date markup. Its streamed-theatre page does -- that half is where an upgrade would start. |
| `cinemas/dugdaleartscentre.co.uk/health.js`  | Dugdale Arts Centre  | 1 request                            | Cards carry a title, a type and a duration. Its Spektrix client is the council's -- 1104 events -- and the events call ignores `startFrom`, so JW3's route would cost 2.5MB an hour to count five listings.       |
| `cinemas/alexandrapalace.com/health.js`      | Alexandra Palace     | 1 request, against 18                | Counts `listings`, not films: this is the theatre's whole what's-on, and film is only told from squash and concerts by running `isFilmEvent` over an event's description, which lives on the event page.          |

Prefer a probe that can count dates. Reach for this one only when the cheap
endpoint genuinely has none, and say in the probe why.

## Known blind spots

**Showings added to a film already listed on a date it already plays.**
Invisible at 57 of the 132 covered venues -- every venue not on `performance`.
Seeing it costs a request per date, which is the trade the whole stage is built
on. In publish terms it is a schedule tweak rather than a new listing: a new
film or a new date, which are the signals that do land, cover the realistic
cases.

**Lumiere Romford's date count is capped.** The CineSync calendar returns at
most one page of dates -- 100 -- and admits it only by coming back full.
Verified as unavoidable: `page_number`, `per_page`, `session_date`,
`start_date`, `from_date`, `date_from` and `month` all return the identical
nearest-100 window. The row reports `datesAtLeast` rather than `dates` so the
number is read as the floor it is.

In practice this matters less than it looks. Lumiere's 100 dates span three and
a half months at 90% daily density, and 121 of its 130 films open inside that
window -- so a new film almost never creates a new date there, and it is the
film total that moves when the venue publishes. The date axis also rolls forward
daily, so a programme extending past the window surfaces late rather than never.

**The `film-totals` venues have no date signal at all.** They catch the listing
breaking, the film filter changing, and the programme emptying. They cannot see
a publish that adds dates to films already listed.

## What fails the job

Rows are written before the stage is allowed to fail, because a challenge or a
missing venue is exactly the evidence the log exists to keep.

| Reason kind          | Job                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `probe-error`        | ❌ red -- the probe could not complete                                                                                    |
| `unknown-venue-id`   | ❌ red -- an id we track is gone from the chain's own site list                                                           |
| `bot-challenge`      | ⚠️ green -- retried once after about a minute first; only challenges are retried                                          |
| `source-maintenance` | ⚠️ green -- a holding page                                                                                                |
| `source-queue`       | ⚠️ green -- a virtual waiting room, told from the host the navigation landed on                                           |
| `no-listings-found`  | ⚠️ green -- a venue with nothing on                                                                                       |
| `expected-closure`   | ⚠️ green -- a venue declared shut in `common/expected-closures.js`; the row keeps what was actually seen under `observed` |

## Venues without a probe

27 eligible venues have none. All have their own `retrieve.js` -- there is no
untouched chain left, only single venues and small shared platforms:

`acflondon.org`, `adventurecinema.co.uk-kew-gardens`, `backyardcinema.co.uk`,
`cadoganhall.com`, `canarywharf.com-summer-screens`, `cinemamuseum.org.uk`,
`closeupfilmcentre.com`, `davidleancinema.org.uk`,
`firmdalehotels.com-charlotte-street`, `firmdalehotels.com-covent-garden`,
`firmdalehotels.com-soho`, `fulhampier.com`, `ibraaz.org`,
`irishculturalcentre.co.uk`, `lewisham.gov.uk-deptford-lounge`,
`museumofthehome.org.uk`, `not-nowhere.org`, `ogniskopolskie.org.uk`,
`rafmuseum.org.uk-london`, `richmix.org.uk`, `royalalberthall.com`,
`royalparks.org.uk-hyde-park`, `sandsfilms.co.uk`, `sydenhamarts.co.uk`,
`thehammondtheatre.co.uk`, `thehorsehospital.com`, `whitechapelgallery.org`

**The case for probing these is thin, and worth stating plainly.** Nearly all
have a retrieve of one to three requests, so a probe there saves nothing - it
costs what the retrieve costs. The only thing it buys is frequency, an hourly
check instead of a daily one, at venues that screen a handful of films a year
and whose ordinary row would read `no-listings-found`. That is a different
proposition from everything above, where the probes replaced roughly 900
requests with 45. Firmdale is the only shared platform left, three venues behind
one probe, though its listing selector is generic enough (`.text-block`,
fourteen on the page, the first being "Book a Room") that the probe would lean
on the transform's text parsing.

Rich Mix needs investigating rather than probing. It answers 403 site-wide, to
any user agent, from a datacenter address -- so this is IP blocking rather than
anything a probe would fix. Whether its retrieve is also being blocked where the
pipeline actually runs is worth knowing: if it is, the venue has been failing
daily, which matters more than any probe on this list.

The browser-driven venues (Close-Up on camoufox; the Cinema Museum, Canary Wharf
and Fulham Pier on Playwright) are the most expensive both to write and to run
hourly, and are best left last. Beyond those, most of what remains are
occasional-film venues -- museums, music venues, parks, hotels -- where
`no-listings-found` is the normal state, so a probe mostly confirms an empty
listing. It still catches the listing changing shape while empty, which is a
failure nobody would otherwise notice, but the return is thinner.

## Adding a probe

A probe is a function taking the array of venue attributes the caller resolved,
and returning one row per venue. See `common/health-probe.js` for the shared
plumbing -- `probeText`, `probeJson`, `probeError`, `withChallengeRetry` and
`startObservation` -- and copy the closest existing probe rather than starting
from scratch.

- **A chain with one call answering for every venue** goes in
  `common/<chain>/health.js` and is registered in the `groupProbes` map in
  `scripts/health/index.js`, keyed by the id prefix its venues share.
- **A venue with no call to batch** exports `health` from its own module beside
  `retrieve` and `transform`. Where its siblings share a platform, the probe
  lives in `common/<platform>/health.js` and each venue re-exports it in one
  line; where the shared probe needs the venue's own url or view parameters, the
  cinema module binds them the way its `retrieve` does.
- **Read the venue's own listing first** where the counts come from somewhere
  else. That is what separates a venue with nothing on from a site that has
  stopped answering with a programme at all.
- **Share the parsing with the retrieve.** Where both read the same blob,
  selector or walk, it belongs in a `utils.js` both require -- two copies drift.
- **Document the traps at the top of the probe.** These endpoints are quirkier
  than they look, and the comment is the only place that knowledge lives.
- **`probeText` takes `acceptStatuses`** for a source that serves the listing
  under a status it means nothing by -- the ICA's what's-on has answered 404
  with the whole programme in the body. Use it only where the venue's `retrieve`
  already tolerates the same status.

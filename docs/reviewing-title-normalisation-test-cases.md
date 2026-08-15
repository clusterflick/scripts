# Reviewing Title Normalisation Test Cases

This guide covers how to review new entries in `common/tests/test-titles.json`
after the daily CI job adds them, decide whether each output is correct, and fix
anything that isn't.

## Background

`common/normalize-title.js` converts raw cinema listing titles into a normalised
string used for TMDB matching and deduplication. The same function is applied to
both the venue's title **and** the TMDB title before comparison, so
normalization only needs to be **consistent**, not perfectly readable —
`"james the giant peach"` still matches TMDB's `"James and the Giant Peach"`
because both are normalized identically.

The two files you'll edit most often:

| File                                | Purpose                                         |
| ----------------------------------- | ----------------------------------------------- |
| `common/normalize-title.js`         | Structural rules, corrections, processing order |
| `common/known-removable-phrases.js` | Flat list of strings to strip verbatim          |

## Normalization processing order

Understanding the order matters when debugging why an output looks wrong.

1. **Basic cleanup** — whitespace collapse, smart-quote normalisation,
   `standardizePrefixingForTheatrePerformances`, lowercase.

2. **Corrections array** (`normalize-title.js` lines ~26–652) — applied first.
   Each entry is `[pattern, replacement]` where pattern is a string or regex.
   Strings are lowercased before matching. Use this for one-off title fixes,
   format normalisation (e.g. dash→colon), and extraction patterns.

3. **Structural prefix extractors** — a series of named checks:

   - `hasPresents` — strips everything before `presents:` / `presents`
   - `hasScreenings` — strips everything before `screenings of:` / `screenings:`
   - `matchesOpenPrefix(title, "club|night|festival|gala|…")` — strips a `Word:`
     or `Word;` prefix mid-title, keeping what follows the colon
   - `matchesStartingPrefix(title, "film|throwback|member|…")` — same but
     anchored to the start

4. **`hasSeparator`** — the most important rule to understand:

   ```js
   title.match(/^(.*?)\s+(?:\+|-|\/|\||•)\s*/);
   ```

   Takes everything **before the first** `+`, `-`, `/`, `|`, or `•`. This is
   correct for stripping add-ons like `Film + Q&A` or `Film - 20th Anniversary`,
   but **it will silently discard the film title** if the venue formats their
   listing as `Venue - Film Title`. See the
   [dash-prefix pattern](#the-dash-prefix-problem) below.

   **The separator must be preceded by whitespace.** The regex requires `\s+`
   before the separator character. A suffix like `Title/Q&A` (no space before
   `/`) or `Title- Sold Out` (no space before `-`) will not be caught —
   `hasSeparator` won't fire, and the suffix will survive into the output. Add
   it as a removable phrase, including the leading separator character (e.g.
   `"- sold out"`, `"/Q&A with Maria Petschnig"`).

   **Em-dash `–` is not in this list.** A title like `Venue – Film` passes
   through `hasSeparator` untouched. The em-dash is instead collapsed to a space
   by the final cleanup phase (`/\s+(-|–)\s+/g → " "`), and any leading `–` left
   after phrase removal is stripped by `/^(-|–)/g`. This means em-dash venue
   prefixes can be handled with a plain removable phrase rather than the
   two-step correction approach — see the [em-dash variant](#em-dash-variant)
   worked example.

5. **`knownRemovablePhrases`** — iterates `known-removable-phrases.js` and calls
   `title.replace(phrase.toLowerCase(), "")` for each. Phrases are matched as
   plain substrings, case-insensitively (title is already lowercase).

6. **Year / parentheses handling** — if the title ends with `(YYYY)` the year is
   preserved; otherwise trailing `(...)` is removed. A lone trailing `)` is
   removed by `/^([^(]+)\)$/`.

7. **Final cleanup** — diacritics, hyphens between letters, `and`/`und` removal,
   punctuation stripping, whitespace collapse, `.trim()`.

   Notable rules in this phase:

   - `/\s+[a|u]nd\s+/gi → " "` — removes `and` and `und` everywhere. This is
     intentional and consistent; TMDB titles receive the same treatment.
   - `/ a$/i → ""` — removes a trailing ` A` (e.g. left over after `Q and A`
     suffix removal).
   - `/^the (?=\S+\s+)/i → ""` — strips a leading `The ` when the title has
     three or more words.

## The review workflow

### Step 1 — run the current output

```bash
node -e "
const n = require('./common/normalize-title.js');
console.log(n('Your Input Title Here'));
"
```

The `output` field in `test-titles.json` is what the test **expects**, not
necessarily what is correct. When the daily job adds new entries it records
whatever the normaliser currently produces. Your job is to decide whether that
output is good or wrong.

### Step 2 — search for analogous examples before judging

Before deciding whether an output is correct, **search `test-titles.json` for
similar patterns**. This is the most important step and the easiest to skip.

```bash
# Is this prefix already stripped in other titles?
grep -A2 '"Babykino:' common/tests/test-titles.json

# How are other film festival prefixes handled?
grep -B1 -A2 'Film Festival' common/tests/test-titles.json | grep '"output"'

# How are other "Venue - Film" dash patterns handled?
grep -B1 '"output": "' common/tests/test-titles.json | grep ' - '
```

The existing test data is the authoritative record of intended behaviour.

When checking whether a series/venue prefix already exists in
`known-removable-phrases.js`, also search for the hyphen/space variant — cinemas
often format the same name both ways (e.g. `"Fetish-Friendly:"` and
`"Fetish Friendly:"`). If only one variant is present, add the other alongside
it.

### Step 3 — classify the issue

| Symptom                                           | Likely cause                                  | Fix                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Venue/series name left in output                  | Phrase not in `known-removable-phrases.js`    | Add it                                                                                                                                                 |
| Film title stripped, only venue name left         | `hasSeparator` ate the film (hyphen format)   | Dash→colon correction + removable phrase                                                                                                               |
| Venue name + film title run together (em-dash)    | `–` not in `hasSeparator`; collapses to space | Removable phrase with trailing space (see [em-dash variant](#em-dash-variant))                                                                         |
| Stray character(s) left (e.g. a lone `s`)         | A phrase partially matches a longer word      | Add the longer form **before** the shorter form in `known-removable-phrases.js`                                                                        |
| Event suffix not removed (Q&A, anniversary, etc.) | Phrase not in `known-removable-phrases.js`    | Add it; if suffix is attached directly to the last word (no space before separator), include the leading separator in the phrase (e.g. `"- sold out"`) |
| Film title in parentheses dropped                 | Parentheses removal rule stripped it          | Follow the `"Prefix ("` pattern (see below)                                                                                                            |

### Step 4 — apply the right fix

> **Default to `known-removable-phrases.js`.** Only reach for the corrections
> array when the fix requires structural transformation (e.g. dash→colon,
> rewriting a title) rather than pure removal. A regex removal in `corrections`
> is a smell when a plain string in `known-removable-phrases.js` would do the
> same job.

There are three approaches, in order of preference:

#### 1. Simple: add to `known-removable-phrases.js`

For labels that should just be removed wholesale. The file is broadly
alphabetical — place new entries accordingly.

```js
"Preschool Pics:",     // → removes "Preschool Pics: Finding Nemo" prefix
" Q&A with the director",  // → strips this suffix from any title
```

#### 2. Correction + removable phrase (the dash-prefix and plus-prefix problems)

`hasSeparator` runs **before** `knownRemovablePhrases`, so a title like
`Community Cinema at UCL East - Monk in Pieces` loses the film before the phrase
list even runs. The same applies to `+` when it appears inside a venue prefix
rather than between a film and an add-on.

The fix is always the same two-step pattern: convert the separator to one that
won't fire `hasSeparator`, then remove the prefix as normal.

**Dash variant** — convert `-` to `: `:

```js
// Step 1 — convert dash to colon so hasSeparator no longer fires
["Community Cinema at UCL East - ", "Community Cinema at UCL East: "],
```

```js
// Step 2 — now the colon prefix is removable as normal
"Community Cinema at UCL East:",   // in known-removable-phrases.js
```

**Plus variant** — convert `+` to `&` (see `["Afronauts + ", "Afronauts & "]`):

```js
// Step 1 — convert + to & so hasSeparator no longer fires
["Argentine season launch: Live music + ", "Argentine season launch: Live music & "],
```

```js
// Step 2 — now the full prefix is removable as normal
"Argentine season launch: Live music & ",   // in known-removable-phrases.js
```

Check whether an existing entry for the venue already exists (e.g.
`"UCL East Community Cinema:"`) so you don't duplicate.

#### 3. Parenthetical film title

When the film is in parentheses after an event label, follow the existing
`"Bridal Cinema Club Community Night ("` pattern:

```js
// In known-removable-phrases.js — note the trailing open-paren
"Cinema Club Community Night (",
```

This removes the prefix _including_ the `(`, leaving `Film Title)`. The trailing
`)` is then cleaned up by the `/^([^(]+)\)$/` rule in the final phase.

## Key pitfalls

**Removing a phrase can empty the entire title** — if `knownRemovablePhrases`
strips the last content from a title (e.g. the input is literally
`"Short Film Screening"` with no film name), the normaliser falls back to
`backReturnTitle` — the lowercased title as of after basic cleanup — rather than
returning an empty string. So `n("Short Film Screening")` returns
`"short film screening"`, not `""`. This is intentional: an empty result would
be worse than the original. Keep it in mind when adding broad phrases and
wondering why a standalone case isn't being stripped.

**Phrase removal can expose a leading space that matches other phrases** —
`knownRemovablePhrases` does a plain substring replace with no post-trim. If you
add `"Foo Bar:"` and the title is `"foo bar: uncut gems"`, removing `"foo bar:"`
leaves `" uncut gems"`, and a phrase like `" uncut"` (with a leading space) will
then match, producing just `"gems"`. The fix is to include the trailing space in
the phrase: `"Foo Bar: "`. Do this whenever the phrase is always followed by
more content (i.e. it is a prefix label, not a suffix or mid-title fragment).

**Plural/singular ordering** — `known-removable-phrases.js` uses substring
matching. `"Documentary Screening"` will partially match
`"Documentary Screenings"`, leaving a stray `s`. Always add the **longer
(plural) form first**:

```js
"Documentary Screenings",   // matched first
"Documentary Screening",    // catches remaining singular cases
```

**Prefer specific strings over regexes in corrections** — if there is only one
known instance of a pattern, use the exact string. Only reach for a regex when
multiple distinct values need the same treatment.

```js
// Preferred — one known director for this series
["Goethe-Kino - Mascha Schilinski - ", "Goethe-Kino & Mascha Schilinski: "],

// Avoid — general regex when a specific string will do
[/^goethe-kino - [^-]+ - /i, ""],
```

**Prefer `known-removable-phrases.js` over corrections** — a regex removal in
`corrections` (e.g. `[/documentary screenings?/i, ""]`) is a smell when one or
two plain-string removable phrases would work just as cleanly. The corrections
array is for structural transformations (rewriting a title, converting a dash to
a colon), not for stripping unwanted text.

**Festival and series prefixes are always stripped** — if a title begins with a
recognisable film festival or venue screening-series name followed by a colon,
it belongs in `known-removable-phrases.js`. Search the file and the test data
before deciding a prefix is "intentional":

```bash
grep '"output"' common/tests/test-titles.json | grep 'film festival' | head -10
```

**A strand name being a plausible title on its own does not make it an
exception.** A dash-prefix strand like `"Reel Talk"` reads as a standalone
title too, and does appear alone elsewhere in `test-titles.json` — that is
**not** a reason to special-case it with a one-off correction instead of the
standard dash→colon + removable-phrase pattern. Generalise it the normal way
(`["Reel Talk - ", "Reel Talk: "]` + `"Reel Talk: "` in
`known-removable-phrases.js`) and let it strip consistently everywhere the
strand name appears with a colon or dash. A bare `"Reel Talk"` with nothing
after it is unaffected, since there's no separator for the correction to
fire on.

Generalising like this can flip the expected output of an **existing**
locked-in test case that happens to share the same prefix — e.g.
`"Reel Talk - sustaining a healthy career in TV"` previously expected
`"reel talk"`; after generalising, the correct expectation is
`"sustaining a healthy career in tv"`. That's not a regression to work around,
it's the fix reaching every affected case — update the old entry's `output` to
match rather than reintroducing a one-off to preserve it. Run the full test
suite after any generalisation and treat every newly-failing assertion as a
candidate for updating, not a sign the generalisation was wrong.

## Adding a test case

When you add or correct a rule, also add an entry to `test-titles.json`:

```json
{ "input": "Film Club: Some Film", "output": "some film" }
```

`input` is the raw venue title. `output` is what `normalizeTitle()` should
return after your fix. Run the tests to confirm:

```bash
npm test -- common/tests/normalize-title.test.js
```

## Reference: worked examples

These cases illustrate the patterns above. `test-titles.json` contains thousands
more historical examples — always search there first.

### Simple prefix removal

| Input                                                    | Output                 | Fix                                                                                                                                                                              |
| -------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Preschool Pics: Finding Nemo`                           | `finding nemo`         | Added `"Preschool Pics:"` to known-removable-phrases, following the same pattern as `"Babykino:"`                                                                                |
| `Little Venice Film Festival 2026: Swiss Films in Focus` | `swiss films in focus` | Added `"Little Venice Film Festival 2026:"` — all festival colon-prefixes should be stripped; confirmed by searching existing festival entries                                   |
| `Fashion & Cinema: Sense and Sensibility`                | `sense sensibility`    | Added `"Fashion & Cinema:"` to known-removable-phrases — a distinct strand from `"Fashion in Film Festival:"` (already handled), but the same "colon-prefix strand name" pattern |

### Suffix removal

| Input                                                         | Output                     | Fix                                                                                                                                                                                                       |
| ------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The Conspiracists (2025) Q&A with the director`              | `the conspiracists (2025)` | Added `" Q&A with the director"` to known-removable-phrases                                                                                                                                               |
| `LVFF 2026: Beautiful and Neat Room/Q&A with Maria Petschnig` | `beautiful neat room`      | Added `"/Q&A with Maria Petschnig"` to known-removable-phrases — `hasSeparator` only fires when `/` is preceded by whitespace, so `Room/Q&A` (no space) falls through and the suffix needs its own phrase |

### Dash-prefix and plus-prefix problem

| Input                                                    | Bad output                           | Good output        | Fix                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Community Cinema at UCL East - Monk in Pieces`          | `community cinema at ucl east`       | `monk in pieces`   | Correction `"Community Cinema at UCL East - " → "Community Cinema at UCL East: "` + phrase `"Community Cinema at UCL East:"`                                                                                                                                                                                                                       |
| `Goethe-Kino - Mascha Schilinski - The Sound of Falling` | `goethekino`                         | `sound of falling` | Correction `"Goethe-Kino - Mascha Schilinski - " → "Goethe-Kino & Mascha Schilinski: "` + phrase `"Goethe-Kino & Mascha Schilinski:"`                                                                                                                                                                                                              |
| `Argentine season launch: Live music + Wild Tales`       | `argentine season launch live music` | `wild tales`       | Correction `"Argentine season launch: Live music + " → "Argentine season launch: Live music & "` + phrase `"Argentine season launch: Live music & "` (`+` → `&` pattern)                                                                                                                                                                           |
| `Reel Talk - The Christophers`                           | `reel talk`                          | `the christophers` | Correction `"Reel Talk - " → "Reel Talk: "` + phrase `"Reel Talk: "` — standard pattern, same as the other rows. Also flips the expected output of the pre-existing `"Reel Talk - sustaining a healthy career in TV"` entry from `"reel talk"` to `"sustaining a healthy career in tv"`; update that entry too rather than leaving it inconsistent |

### Em-dash variant

Em-dash `–` is **not** matched by `hasSeparator`, so the film title is never
lost. The em-dash collapses to a space in final cleanup, and any leading `–`
remaining after phrase removal is stripped by `/^(-|–)/g`.

There are two sub-cases depending on which side of the em-dash the film title is
on:

**Venue prefix** (`Venue – Film`): the em-dash produces
`"venue name film title"` as one run. The fix is a removable phrase for the
venue name with a trailing space — no correction needed.

**Event suffix** (`Film – Event Descriptor`): the em-dash and everything after
it must be removed. Because the em-dash is still present at step 5 (final
cleanup hasn't run yet), include it in the removable phrase.

| Input                                                                                   | Bad output                                                    | Good output     | Fix                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Community Cinema at UCL East – Pride`                                                  | `community cinema at ucl east pride`                          | `pride`         | Added `"Community Cinema at UCL East "` to known-removable-phrases                                                               |
| `Ugetsu (1953) – Japanese Golden Age Classic Screening & Q&A with Irene González-López` | `ugetsu (1953) japanese golden age classic screening q&a ...` | `ugetsu (1953)` | Added `" – Japanese Golden Age Classic Screening & Q&A with Irene González-López"` to known-removable-phrases (em-dash included) |

### Partial phrase match (plural/singular)

| Input                                                    | Bad output                      | Good output                   | Fix                                                                                              |
| -------------------------------------------------------- | ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `Little Venice Film Festival Documentary Screenings - 1` | `little venice film festival s` | `little venice film festival` | Added `"Documentary Screenings"` **before** `"Documentary Screening"` in known-removable-phrases |

### Parenthetical film title

| Input                                                                   | Bad output                    | Good output               | Fix                                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Gigi & Olive - Cinema Club Community Night (My Best Friend's Wedding)` | `cinema club community night` | `my best friends wedding` | Added `"Cinema Club Community Night ("` to known-removable-phrases, following the existing `"Bridal Cinema Club Community Night ("` pattern |

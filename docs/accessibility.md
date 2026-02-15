# Accessibility Tags

Clusterflick tracks accessibility features on individual screenings so users can
filter for screenings that meet their needs. Each screening can have zero or
more of the following tags.

## Tag Definitions

### `audioDescription`

The screening includes a supplementary audio track that describes visual
elements (actions, expressions, scene changes) for blind or visually impaired
viewers.

**How venues label it:** "Audio Described", "AD"

**Detection:** Set from structured venue data (API attributes, HTML tags) or
from title patterns like `AD:` or `(Audio Described)`. Not inferred from
descriptions because "audio" appears too frequently in unrelated contexts.

### `babyFriendly`

The screening is designed to welcome parents or carers with babies and young
children. This covers two common formats:

- **Parent & baby screenings** — lower volume, lights slightly raised, pram
  parking available, no pressure if your baby cries.
- **Kids club / family programming** — curated shorter or age-appropriate films
  aimed at young children (e.g. Movies for Juniors, Big Shorts, Kids Club,
  Babykino).

The common thread is that the screening accommodates young children who would
otherwise be disruptive in a standard screening.

**How venues label it:** "Parent & Baby", "Baby & 1", "Kids Club", "Babykino",
"Movies for Juniors", "Big Shorts", "Baby Club"

**Detection:** Set from structured venue data or from title patterns. Also
detected from description text containing phrases like "parent and baby" or
"baby friendly".

### `hardOfHearing`

The screening includes captions or other support for deaf or hard-of-hearing
viewers. This covers:

- **Open captions** — subtitles burned into the image, visible to everyone.
- **Closed captions** — subtitles that can be toggled on via a device.
- **SDH (Subtitles for the Deaf and Hard of Hearing)** — subtitles that include
  non-dialogue audio cues like _[doorbell rings]_ or _[tense music]_.
- **BSL (British Sign Language) interpreted** — a signer is present or
  picture-in-picture signing is provided.

This tag is distinct from `subtitled`, which is for language translation.
`hardOfHearing` captions are in the film's original language and include
non-dialogue cues.

**How venues label it:** "Captioned", "HOH", "HoH", "Hard of Hearing", "CC",
"OC", "SDH", "BSL"

**Detection:** Set from structured venue data or from title patterns. Also
detected from description text containing phrases like "captioned" or "with
captions".

### `relaxed`

A screening with adjustments for neurodiverse audiences, including autistic
viewers and people with learning disabilities or sensory sensitivities.
Typically features:

- Lower sound levels
- Lights kept slightly up
- No trailers or pre-show adverts
- Freedom to move around, make noise, or leave and re-enter
- A calm, tolerant atmosphere

**How venues label it:** "Relaxed Screening", "Autism Friendly", "Sensory
Friendly", "ATF"

**Detection:** Set from structured venue data or from title patterns like
`Relaxed Screening` or `(Relaxed)`. Also detected from description text
containing "relaxed screening".

### `subtitled`

The film is shown with subtitles translating dialogue into another language
(typically English). This tag is for **language accessibility** — making
foreign-language or partially foreign-language films accessible to a broader
audience.

This is distinct from `hardOfHearing`, which provides same-language captions
with non-dialogue cues for hearing accessibility.

**How venues label it:** "Subtitled", "Subbed", "With Subtitles", "(Sub)"

**Detection:** Set from structured venue data or from title patterns. Also
detected from description text containing "with subtitles" or "with english
subtitles".

## Adding Accessibility Mappings for a New Venue

When adding a new cinema or source module, map the venue's accessibility data to
the standard tags above. Common patterns:

1. **Structured data** (API attributes, HTML tags, icon alt text): Map each
   attribute to the appropriate tag in your `transform.js`. Pass the result as
   the `accessibility` parameter to `createAccessibility()`.

2. **Title-based**: The shared `getTitleAccessibility()` function in
   `common/utils.js` automatically scans titles for common patterns. If your
   venue uses non-standard naming, add a venue-specific check or propose a new
   shared matcher.

3. **Description-based**: Pass the screening description as the third argument
   to `createAccessibility(title, accessibility, description)`. The shared
   function will scan for high-confidence accessibility phrases.

Priority order: explicit venue data > title detection > description detection.

## Edge Cases

- **"Subtitled" icon that actually means captions for the hearing-impaired:**
  Some venues use "subtitled" to mean what we call `hardOfHearing`. Check
  whether the subtitles include non-dialogue cues — if so, map to
  `hardOfHearing`. If the venue is ambiguous, prefer `subtitled` unless the
  context clearly indicates hearing accessibility.

- **"Digital" or projection-format labels:** These refer to the projection
  technology, not accessibility. Do not map to `audioDescription` unless the
  venue explicitly confirms it means audio description.

- **Foreign-language films with burned-in subtitles:** If a film is shown in its
  original language with English subtitles as standard (not a special subtitled
  screening), this is a property of the film, not the screening. Only set
  `subtitled` when the venue is flagging it as a specific accessibility feature
  of that screening.

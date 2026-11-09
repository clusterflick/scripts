# Occasions

Clusterflick records what makes a performance more than a screening - someone
in the room, a live score, a premiere - on each performance, as
`performances[].occasions`. The website decides which of them are worth
promoting (a Q&A is a one-off at one venue and house style at another, which
only the whole city can tell you); the transform only records what the venue
said.

## Shape

An object holding only what is happening. Each key is either `true` - it is
happening, and nothing more is known - or an object of details:

```json
{
  "intro": { "guests": ["Benjamin Crais"] },
  "qAndA": true,
  "premiere": { "region": "uk" }
}
```

A performance with no occasion has `{}`. A key is never `false`, and an object
always has at least one detail - `{}` as a value would be a second way of
writing `true`, so `createOccasions` writes it as `true` and the schema rejects
it.

| Key               | Means                                                              | Details                                                        |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `intro`           | Someone introduces the film                                        | `guests`                                                       |
| `qAndA`           | A Q&A after the film (Barbican's "ScreenTalk" included)            | `guests`                                                       |
| `inConversation`  | An "in conversation"                                               | `guests`                                                       |
| `panel`           | A panel discussion                                                 | `guests`                                                       |
| `guestAppearance` | Someone appears, but not in a stated form ("in person", "special") | `guests`                                                       |
| `liveScore`       | Musicians play along with the film                                 | `performers`                                                   |
| `premiere`        | A premiere                                                         | `region`: `uk`, `london`, `european`, `world`, `international` |
| `preview`         | Showing ahead of release                                           | -                                                              |

`guestAppearance` is dropped whenever one of `intro`, `qAndA`,
`inConversation` or `panel` is found, since it then adds nothing.

Names are as the venue wrote them, without the role around them: "a Q&A with
director Poh Si Teng" gives `["Poh Si Teng"]`. A name the rules can't be sure
of is left out rather than guessed - a single word ("Joel"), a run ending in a
job title ("BFI TV Programmer"), or anything after "of" or "for" ("editor of
Terminus") - so a list can be shorter than the venue's, but shouldn't hold
anything that isn't a person or a group the venue named.

## Where it comes from

Like accessibility and format, from three places, most reliable first:

1. **Structured listing data.** A venue that tags performances passes the tags
   as the second argument, as Indy Cinema Group does with its `intro` and `qa`
   tags. `false` and `undefined` are dropped, so `{ qAndA: tags.includes("qa") }`
   is fine; an unknown key or detail throws.
2. **The title and the performance notes.** `createOccasions` reads the title;
   `createPerformance` reads each note, since notes only exist once it has
   joined them.
3. **The description**, read far more cautiously - see below.

```js
createPerformance({
  date,
  notesList,
  url,
  accessibility: createAccessibility(title, {}, description),
  format: createFormat(title, {}, description),
  occasions: createOccasions(
    title,
    { qAndA: tags.includes("qa") },
    description,
    {
      date,
    },
  ),
});
```

`createPerformance` throws without `occasions`, because a performance built
without it would get only what its notes say and pass validation, quietly
skipping the title and description.

## Descriptions

A description is a page of prose about the film, its history and the venue's
booking fees, shared by every performance of the showing. Read as freely as a
title it finds an introduction in a synopsis ("Keating is introduced to an
all-boys school") and a guest in a booking footer ("no fee when tickets are
booked in person"). So a sentence of the description only counts when:

- it is about the screening: "this screening", "will be followed by", "join
  us", "post-screening" and the like;
- it isn't negated ("will NOT be in attendance") or in the past ("was
  introduced by Tony Rayns"), and doesn't describe a recording;
- if it names a date ("The screening on 11 November will be introduced by ..."),
  the performance is on that date, in London. A sentence naming no date applies
  to every performance of the showing: venues name the night when only one is
  special, and a page written as if for one screening is usually about each.

That is why the description needs the performance's `date`.

## Adding a venue

Pass `createOccasions` the same title and description `createAccessibility`
gets, the performance's date, and any structured tags the listing has. When a
title or description isn't being read correctly, fix the rule in
`common/occasions.js` and add the venue's own words to
`common/tests/occasions.test.js` - the tests there are real listings, so a
change is tested against what venues actually write.

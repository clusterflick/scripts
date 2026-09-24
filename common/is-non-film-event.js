const { basicNormalize } = require("./utils");

const nonFilmEvents = [
  /Community Pilates/i,
  /Bearpit Karaoke/i,
  /Paint your own/i,
  // Anchored: a venue billing a painting session after a film or director
  // ("David Lynch Sip and Paint") is still listing that film, so only the
  // listing that is nothing but the painting event is a non-film event.
  /^Sip and Paint/i,
  /WEEKND FANPARK/i,
  /Bioimage Analysis/i,
  /Business Networking/i,
  /Leaders Networking/i,
  /Healthcare & Wellness/i,
  /Performance Networking/i,
  /Networking Night/i,
  /Networking Reception/i,
  /Networking Event:/i,
  /Interior Design Networking/i,
  /Digital Creatives Networking/i,
  /Medtech Innovation/i,
  /Medical Connections/i,
  /Fashion Business/i,
  /Thursday Third Space/i,
  /Free Salsa/i,
  /Cabin Air Conference/i,
  /Connected Intelligence/i,
  /Annual Meeting/i,
  /cancer research symposium/i,
  /Thrift Event/i,
  /Smithsonian Starstruck/i,
  /Neon Naked Life Drawing/i,
  // A guided tour of the gallery sold alongside its listings, never a
  // screening.
  /Discovery Tour/i,
  /Homelessness Research/i,
  /Office Management Show/i,
  /Raver Tots Wembley/i,
  /Photography Workshop/i,
  /Adtech Networking/i,
  /Entrepreneurs Meetup/i,
  // The matrimonial series runs under a different community each time
  // ("BENGALI MUSLIM MARRIAGE EVENT", "BLACK & AFRICAN MUSLIM MARRIAGE"),
  // so match the singles-meetup billing they all share rather than
  // carrying a pattern per community.
  /1-to-1 Single .+ Meetup/i,
  /Dinner Reservation/i,
  /Conferencing \d+ Hour/i,
  // The end-of-term recital a singing course puts on, billed by the course
  // rather than by the venue. "singing" is kept in the pattern because a
  // filmmaking course's showcase is a screening of the films it made.
  /singing course showcase/i,
  /R&B THURSDAYS/i,
  // Only the billed-as-a-gig phrasing - a film screened "with live orchestra"
  // or with a live score is still a film.
  /Live Concert/i,
  // An awards ceremony the venue hosts, not a screening.
  /Social Media Awards/i,
  // The museum's own guided tour, sold under a series name and numbered by
  // edition, listed alongside the screenings in its cinemas.
  /alternative tour of the Science Museum/i,
  // The venue's own carol concert, sung by the audience in the auditorium
  // rather than projected onto it.
  /Carols by Candlelight/i,
  // A support group's craft social, billed by whichever activity it runs that
  // session ("Autumnal Leaf Collages"), so match the social's own billing
  // rather than carrying a pattern per activity.
  /COVID-Safe Social/i,
  // A gardening talk the venue hosts, not a screening. Matched on the talk
  // rather than on the series presenting it ("Ground Level Presents"), because
  // a presenter bills films just as readily as talks.
  /Gardening for Climate/i,
  // The orchestra's New Year's Eve concert, billed as the concert itself
  // rather than as a film it scored. Both spellings of the billing are
  // matched, because the correction that folds "NYE Concert" into the long
  // form runs in normalisation, which this check never reaches.
  /New Year.?s Eve Concert/i,
  /NYE Concert/i,
  // The chain's own equipment check, sold through the public listings with a
  // 15-minute runtime and no film attached to it.
  /^Tech Run \/ Test/i,
  // A talk billed as nothing but its panel. Anchored: "<film> screening with
  // panel discussion" is still a screening of the film named before it, and
  // only a listing that opens on the panel has no film in it at all.
  /^Panel discussion:/i,
  // A conference day the venue hosts, billed by the association running it,
  // with no film attached to it.
  /PLASTA Research & Innovation Day/i,
  // An audio horror podcast the venue hosts, billed by the episode it is
  // recording ("Canned Laughter"), so match the series rather than carrying a
  // pattern per episode. The possessive is matched loosely because the venue
  // publishes the curly apostrophe and this check never reaches the
  // normalisation that straightens it.
  /Gavin.?s Graveyard Gold/i,
  // A poetry pamphlet's launch night, billed by the pamphlet being launched
  // ("A Temporary Temple - '&' Poetry Pamphlet Launch"), so match the launch
  // rather than carrying a pattern per pamphlet. Unanchored for the same
  // reason: the pamphlet's own name is what the listing opens on.
  /Poetry Pamphlet Launch/i,
  // A sketch comedy scratch night, numbered by edition ("Sketchburn 7: a
  // scratch night for sketch comedy films"), so match the numbered series
  // rather than carrying a pattern per edition. The night is what is being
  // sold - there is no film behind the billing to fall back to.
  /Sketchburn \d+:/i,
  // A chess social the venue runs over brunch, with no film attached to it.
  /Chess Brunch/i,
  // The lino version of the printing class the venue already runs, sitting
  // beside the photography workshop above.
  /Lino Printing Workshop/i,
  // A singles-events promoter's night, billed by whichever activity it runs
  // that session ("SINGLES SALSA"), so match the promoter rather than
  // carrying a pattern per activity. The salsa pattern above only catches the
  // free ones.
  /Datenites Presents/i,
  // A club-night promoter, billed by the night it is putting on ("BOXING DAY",
  // "RAMPAGE SOUNDS ALL NIGHT"), so match the promoter rather than carrying a
  // pattern per night - and because the nights are named after films often
  // enough that the billing alone would read as one. "PRESENTS" is kept in the
  // pattern so the venue's own mixtape strand ("Balik Bayan: MIXTAPE: Filipino
  // Edition") still reaches the listings.
  /Mixtape Presents/i,
  // A pub's own events listing, billed by the event it is running that night
  // ("SIERRA LEONE PUB QUIZ EVENT.. PART2"), so match the promoter rather than
  // carrying a pattern per event. Matched there rather than on the quiz,
  // because a quiz a cinema runs is a listing the pipeline publishes.
  /Prince of Peckham Presents/i,
  // A charity's fundraiser, billed by the show put on for it that year ("THE
  // GIFT OF LAUGHTER"), so match the fundraiser rather than carrying a pattern
  // per show.
  /ACLT Fundraiser/i,
  /Matchstick LDN/i,
  // A gallery and archive series of previews, billed by the exhibition or
  // curator talk it is previewing ("KQ Private View | Londoners on Trial at
  // The London Archives"), so match the series rather than carrying a pattern
  // per show. Never a screening: the listings are exhibitions and talks.
  /KQ Private View/i,
  // The gallery's late opening, billed by the strand running that night. Music,
  // workshops and talks across the building, never a film.
  /Tate Modern Lates/i,
  // A talks series: five speakers, fifteen minutes each, never a screening.
  /^5x15:/i,
  /Evening Of Clairvoyance/i,
  /ADHD & Women Summit/i,
  /Deaf Improv Comedy/i,
  // A gig billed by the act and the venue it is playing ("Lily Juniper -
  // 'Bloom Gloom' Live at The Blue"), never a screening.
  /Live at The Blue/i,
  // A guided tour of the gallery, beside the discovery tour above.
  /Semi-Private Tour/i,
];

const isNonFilmEvent = ({ title }) =>
  nonFilmEvents.some((pattern) => basicNormalize(title).match(pattern));

const isNotNonFilmEvent = (event) => !isNonFilmEvent(event);

module.exports = {
  isNonFilmEvent,
  isNotNonFilmEvent,
};

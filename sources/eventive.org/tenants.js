/**
 * Eventive hosts each organiser on its own subdomain and offers nothing that
 * searches across them, so a tenant is only reachable if we name it. Listed
 * here rather than discovered: the platform is used by far more organisers than
 * run cinema screenings in London, and there is no index to filter.
 *
 * A festival that versions its subdomain by year (frightfest2026) needs the URL
 * bumped for the next edition. Between editions the tenant simply has no
 * upcoming events, which reads as an empty result rather than a failure - so a
 * stale entry costs a wasted request, not a red job.
 *
 * `name` is published, not just documentation: it becomes the "Part of ..."
 * note on every performance, so it wants to read as the programme's own name
 * and to carry the edition a listing belongs to.
 *
 * `hasFilmRecords: false` says the tenant hangs no film record off its events.
 * Eventive lets an organiser fill one in but doesn't require it, and a tenant
 * that skips it puts the film in the event's name and description instead.
 * Declared per tenant because the film record is otherwise what separates a
 * screening from the passes and parties sold beside it - see find-events.
 */
module.exports = [
  {
    id: "frightfest2026",
    name: "FrightFest 2026",
    url: "https://frightfest2026.eventive.org",
  },
  {
    id: "bccwhenthestarsmeettheocean",
    name: "When the Stars Meet the Ocean",
    url: "https://bccwhenthestarsmeettheocean.eventive.org",
    // A touring programme rather than a festival at one venue - it books a
    // community centre, an archive and a couple of cinemas across a season,
    // so its events land against several of our venues rather than one.
    hasFilmRecords: false,
  },
];

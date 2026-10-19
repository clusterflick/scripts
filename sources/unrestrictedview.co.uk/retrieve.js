const { format } = require("date-fns");
const { fetchJson } = require("../../common/utils");

// The site is a single-page app reading straight from its Supabase project, so
// these are the requests its own events page makes. The key is the public
// "anon" key shipped in the site's bundle - it opens only what the site shows
// to anyone - and is sent the way the site's Supabase client sends it.
const API_URL = "https://chclvaprixqectjscplp.supabase.co/rest/v1";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoY2x2YXByaXhxZWN0anNjcGxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NTE5MjEsImV4cCI6MjA3OTEyNzkyMX0.f5ikK8E0IRCRFtjke6bBWxVmzNY357701VDkHrOgjts";

// The Hen & Chickens' own programme is theatre and comedy; film comes in under
// this one genre, which covers the festivals the theatre runs and the film
// nights it hosts.
const FILM_GENRE = "Film Festival";

const query = (table, params) =>
  fetchJson(`${API_URL}/${table}?${new URLSearchParams(params)}`, {
    headers: { apikey: ANON_KEY },
  });

async function retrieve() {
  const events = await query("events", {
    select: "*",
    status: "neq.hidden",
    genres: `cs.{"${FILM_GENRE}"}`,
  });

  // Performances carry their date as midnight UTC on the London date, with the
  // start time held apart - the site compares them the same way when it works
  // out which are still to come.
  const today = format(new Date(), "yyyy-MM-dd");
  const performances = events.length
    ? await query("performances", {
        select: "*",
        event_id: `in.(${events.map(({ id }) => id).join(",")})`,
        status: "eq.on_sale",
        performance_date: `gte.${today}T00:00:00+00:00`,
        order: "performance_date.asc",
      })
    : [];

  const venues = await query("venues", { select: "id,name,address" });

  return { events, performances, venues };
}

module.exports = retrieve;

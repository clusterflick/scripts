const zlib = require("node:zlib");
const cheerio = require("cheerio");
const { format } = require("date-fns");
const {
  fetchWithRetry,
  fetchText,
  getText,
  assertSelector,
} = require("../../common/utils");
const { isSoldOnCinematik, getEventSlug } = require("./utils");

// Cinematik runs several programmes, each on a site of its own: Escapes (free,
// BFI-funded screenings), elevenfiftyfive and MASSIVE (distributors' event
// screenings), Eido (event cinema, on its own domain), and Cinematik's own. Each
// is a source in its own right where it sells the ticket - a screen hired at
// Genesis that the venue's own listings never mention - and an aggregator where
// it only links out to the venue's box office. Which it is varies by screening,
// not by programme, so the programmes are all read and the split is made per
// screening (see isSoldOnCinematik).
const HOME_URL = "https://www.cinematik.app/";

// Programmes come and go - a distributor's campaign site is set up for a
// release - so they are read from the Programmes menu every programme's site
// carries, rather than listed here, where a new one would be missed without a
// sound. The home site is read too: it is itself one of them.
const PROGRAMME_LINKS_SELECTOR = ".programmes-overlay-links a[href]";

async function fetchProgrammeOrigins() {
  const html = await fetchText(HOME_URL);
  assertSelector(
    html,
    PROGRAMME_LINKS_SELECTOR,
    `No Programmes menu on ${HOME_URL} - the programmes can't be listed`,
  );
  const $ = cheerio.load(html);
  const origins = $(PROGRAMME_LINKS_SELECTOR)
    .map((_, el) => new URL($(el).attr("href"), HOME_URL).origin)
    .get();
  return [...new Set([new URL(HOME_URL).origin, ...origins])];
}

// Each programme's robots.txt names its sitemap, and the sitemap lists a
// `/book/` page for every upcoming screening - one page per screening, at
// every venue. The event pages can't be used as the index: they render only
// the screenings nearest a default location (40 of Escapes' 121 on the date
// measured), and their JSON-LD stops at 50. A screening that has passed drops
// out of the sitemap, and its page answers 410. The sitemap's name differs by
// programme (escapes-sitemap.xml.gz, eido-sitemap.xml.gz), so it is read from
// robots.txt rather than built.
async function fetchSitemapUrls(origin) {
  const robots = await fetchText(`${origin}/robots.txt`);
  const urls = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gim)].map(
    ([, url]) => url,
  );
  if (urls.length === 0) {
    throw new Error(`No Sitemap in ${origin}/robots.txt:\n${robots}`);
  }
  return urls;
}

const isGzip = (buffer) => buffer[0] === 0x1f && buffer[1] === 0x8b;

async function fetchSitemap(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Sitemap ${url} answered ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  // Served as a .gz file, but a transport that already decoded it hands back
  // the XML itself - so the bytes decide rather than the name.
  const xml = isGzip(buffer)
    ? zlib.gunzipSync(buffer).toString("utf8")
    : buffer.toString("utf8");

  const $ = cheerio.load(xml, { xml: true });
  if ($("urlset").length === 0) {
    throw new Error(`Sitemap ${url} is not a urlset: ${xml.slice(0, 200)}`);
  }
  return $("url > loc")
    .map((_, el) => getText($(el)))
    .get();
}

const getJsonLd = ($) =>
  $('script[type="application/ld+json"]')
    .map((_, el) => JSON.parse($(el).html()))
    .get();

// The two page layouts Cinematik serves (Escapes' older one, and the newer one
// the other programmes use) name the title and the local time differently.
const TITLE_SELECTOR = "h1.carousel-title, h1.event-title";
const LOCAL_TIME_SELECTOR = ".carousel-date, .booking-hero-date";

// The JSON-LD writes every time with a +00:00 offset. That is right for the
// winter dates it was first read on, but whether it stays right through BST -
// or is local time labelled UTC - couldn't be checked, as past screenings are
// gone. The page also prints the local time ("Tue 24th Nov, 19:30"), so the
// two are held to each other: a mislabelled offset fails the retrieve rather
// than moving every summer screening by an hour.
function assertLocalTimeMatches(url, startDate, localTimeText) {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unreadable startDate "${startDate}" on ${url}`);
  }
  const expected = format(date, "EEE do MMM, HH:mm");
  if (localTimeText.replace(/\s+/g, " ") !== expected) {
    throw new Error(
      `The time ${url} shows ("${localTimeText}") is not its JSON-LD ` +
        `startDate ${startDate} in London ("${expected}") - Cinematik's ` +
        `offsets may not be what they claim`,
    );
  }
}

function parseBookPage(url, html) {
  const $ = cheerio.load(html);
  const event = getJsonLd($).find((data) => data["@type"] === "Event");
  if (!event) throw new Error(`No Event JSON-LD on ${url}`);

  // A screening Cinematik only links out to is the venue's own listing,
  // already read from the venue - keeping it would list it twice. Its page is
  // laid out differently again (BFI Southbank's lists a fortnight of times),
  // so nothing else on it is read.
  if (!isSoldOnCinematik(event)) return null;

  assertSelector(html, TITLE_SELECTOR, `No title on ${url}`);
  assertSelector(html, LOCAL_TIME_SELECTOR, `No local time on ${url}`);
  const title = getText($(TITLE_SELECTOR).first());
  const localTime = getText($(LOCAL_TIME_SELECTOR).first());
  assertLocalTimeMatches(url, event.startDate, localTime);

  // What the booking page tells someone about to book this screening and no
  // other - "This film will be shown with descriptive subtitles on screen",
  // "Tickets are completely free but limited to 2 adult tickets per customer".
  const notices = $(".booking-notice")
    .map((_, el) => getText($(el)).replace(/\s*\n\s*/g, "\n"))
    .get()
    .filter(Boolean);

  return { title, event, notices };
}

// The note is rich text, a paragraph to a block, and taking its text whole runs
// one paragraph's last sentence into the next one's first ("credits roll.1155
// Soundsystem is...") - which then reads as one sentence to the occasion rules.
const getBlockText = (html) =>
  cheerio
    .load(html.replace(/<br\s*\/?>|<\/(?:div|p|li|h\d)>/gi, "\n"), null, false)
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

// The event page carries what a booking page doesn't: the film's credits
// (`workPresented`) and, on the newer layout, a note about the night itself -
// elevenfiftyfive's "1155 Soundsystem" live vinyl set after the credits. The
// note sits inside the date-tabbed screenings frame, so it is read for the
// date it belongs to.
function parseEventPage(url, html) {
  const $ = cheerio.load(html);
  const [series] = getJsonLd($)
    .flat()
    .filter((data) => data["@type"] === "EventSeries");
  if (!series) throw new Error(`No EventSeries JSON-LD on ${url}`);
  const note = $(".showtimes-public-note")
    .map((_, el) => getBlockText($(el).html()))
    .get()
    .filter(Boolean)
    .join("\n\n");

  return {
    title: series.name,
    description: series.description ?? null,
    work: series.workPresented ?? null,
    note: note || null,
  };
}

async function retrieve() {
  const bookPages = {};
  const eventPages = {};
  const sitemapUrls = [];
  let screeningCount = 0;

  for (const origin of await fetchProgrammeOrigins()) {
    const bookUrls = [];
    for (const sitemapUrl of await fetchSitemapUrls(origin)) {
      sitemapUrls.push(sitemapUrl);
      bookUrls.push(
        ...(await fetchSitemap(sitemapUrl)).filter((url) =>
          new URL(url).pathname.startsWith("/book/"),
        ),
      );
    }
    screeningCount += bookUrls.length;

    for (const url of bookUrls) {
      const page = parseBookPage(url, await fetchText(url));
      if (!page) continue;

      const date = format(new Date(page.event.startDate), "yyyy-MM-dd");
      const eventUrl = `${origin}/events/${getEventSlug(page.event)}?date=${date}`;
      if (!eventPages[eventUrl]) {
        eventPages[eventUrl] = parseEventPage(
          eventUrl,
          await fetchText(eventUrl),
        );
      }

      bookPages[url] = { programme: origin, eventUrl, ...page };
    }
  }

  // Escapes alone runs a free screening across the country most months, so a
  // sweep of every programme finding nothing at all means the sitemaps have
  // moved or stopped listing screenings, not that nothing is on. A sweep that
  // finds screenings but none sold here is legitimate - between Escapes
  // dates, everything listed may be a distributor linking out.
  if (screeningCount === 0) {
    throw new Error(
      `No /book/ pages in any Cinematik sitemap ` +
        `(${sitemapUrls.join(", ")}) - the sitemaps may have changed`,
    );
  }

  return { bookPages, eventPages };
}

module.exports = retrieve;

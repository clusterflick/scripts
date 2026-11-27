// Wix server-renders each app's state into the page as JSON, keyed by the
// app's definition id. This one is Wix Events'.
const WIX_EVENTS_APP_ID = "140603ad-af8d-84a5-2c80-a0f60cb47351";

function getEventsWarmupData(html, url) {
  const match = html.match(
    /<script type="application\/json" id="wix-warmup-data">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error(`No Wix warmup data found on ${url}`);
  }
  const eventsData = JSON.parse(match[1]).appsWarmupData?.[WIX_EVENTS_APP_ID];
  if (!eventsData) {
    throw new Error(`No Wix Events data found on ${url}`);
  }
  return eventsData;
}

// A listing page holds one entry per events widget on it, keyed by the
// widget's component id ("widgetcomp-m34bters"), so it's found by shape rather
// than by name.
function getListedEvents(html, url) {
  const widgets = Object.values(getEventsWarmupData(html, url)).filter(
    (widget) => Array.isArray(widget?.events?.events),
  );
  if (widgets.length === 0) {
    throw new Error(`No Wix Events widget found on ${url}`);
  }

  return widgets.flatMap(({ events }) => {
    // The widget renders its first page only and loads the rest in the
    // browser, so a listing with more to come is missing events.
    if (events.hasMore) {
      throw new Error(
        `The Wix Events widget on ${url} has more events than it rendered`,
      );
    }
    return events.events;
  });
}

function getPageEvent(html, url) {
  const event = getEventsWarmupData(html, url).EventsPageInitialState?.event
    ?.event;
  if (!event?.id) {
    throw new Error(`No Wix event found on the event page ${url}`);
  }
  return event;
}

// A site chooses the path of its event pages ("/events/...", "/event-details/
// ..."), so the link is read off the listing rather than built.
function getEventPageUrl(listingHtml, domain, slug) {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = listingHtml.match(
    new RegExp(`${escape(domain)}/[^"/]+/${escape(slug)}(?=")`),
  );
  if (!match) {
    throw new Error(`No link to the event page for "${slug}" on ${domain}`);
  }
  return match[0];
}

// Wix stores rich text as a tree of Ricos nodes: blocks (PARAGRAPH, HEADING,
// LIST_ITEM ...) holding TEXT runs. A block with text of its own becomes a
// paragraph; empty ones, which Wix uses as spacers, are dropped.
function getRichText(document) {
  const paragraphs = [];
  const getInlineText = (node) =>
    node.type === "TEXT"
      ? node.textData?.text || ""
      : (node.nodes || []).map(getInlineText).join("");
  const walk = (node) => {
    const children = node.nodes || [];
    if (children.length > 0 && children.every(({ type }) => type === "TEXT")) {
      const text = getInlineText(node).replace(/\s+/g, " ").trim();
      if (text) paragraphs.push(text);
      return;
    }
    children.forEach(walk);
  };
  walk(document || {});
  return paragraphs.join("\n\n");
}

module.exports = {
  getListedEvents,
  getPageEvent,
  getEventPageUrl,
  getRichText,
};

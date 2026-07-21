const slugify = require("slugify");
const getShow = require("./get-show");
const { getId } = require("../utils");

// The canonical loadArticle URL for an article. Both discovery flows key
// moviePages by this - built from the id BFI embeds in articleContext - so the
// calendar flow and the films-index flow converge on the same key and dedupe by
// article id. For a calendar show this is byte-identical to its `.result-box-item`
// href (context_id stripped), so keying this way leaves the calendar flow's
// output unchanged.
function buildShowPath(articleId) {
  return (
    `default.asp?doWork::WScontent::loadArticle=Load` +
    `&BOparam::WScontent::loadArticle::article_id=${articleId}`
  );
}

// Load one show and add it to moviePages, keyed by buildShowPath. `articleId` on
// the show (present for calendar shows, whose URL carries it; absent for index
// shows, whose id is only known after loading) lets us skip an article we've
// already loaded from the other source without a second fetch. A broken (500)
// article is skipped by getShow (returns null) and simply left out.
async function loadShowInto(
  getPage,
  attributes,
  { showUrl, title, articleId: knownId },
  moviePages,
  loadedIds,
  delayMs = 0,
) {
  if (knownId && loadedIds.has(knownId.toUpperCase())) return;

  const { url, domain, articleId } = attributes;
  console.log(`    - [${Date.now()}] Getting data for "${title}" ... `);

  const slug = slugify(title, { strict: true }).toLowerCase();
  const cacheKey = `bfi.org.uk-${getId(showUrl)}-${articleId}-${slug}`;
  const loaded = await getShow(
    getPage,
    url,
    cacheKey,
    domain,
    showUrl,
    delayMs,
  );
  if (!loaded) return; // broken (500) article, skipped

  const id = loaded.articleContext.articleId;
  moviePages[buildShowPath(id)] = {
    title,
    html: loaded.html,
    articleContext: loaded.articleContext,
  };
  loadedIds.add(id.toUpperCase());
}

module.exports = { loadShowInto, buildShowPath };

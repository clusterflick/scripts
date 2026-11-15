const { fetchJson } = require("../../common/utils");
const attributes = require("./attributes");

// The club sells its tickets through its own Squarespace shop ("Book here"),
// one product per screening. Squarespace serves any collection as JSON with
// `?format=json`, which carries each product's title, description and stock -
// everything the HTML pages show, without scraping them.
//
// A product's description is its `excerpt`: Squarespace keeps the product's
// "Additional Info" in `body`, and leaves that out of the list.
//
// Only the fields find-events reads are kept: the response also carries the
// whole site's configuration, which is most of its ~800KB.
async function retrieve() {
  const collection = await fetchJson(`${attributes.url}?format=json`);

  if (!Array.isArray(collection.items)) {
    throw new Error(
      `No product list in ${attributes.url}?format=json - the shop may have moved or changed shape`,
    );
  }
  // The shop's page size is 999 and it holds well under that, so everything
  // arrives in one response. Paging isn't handled; say so rather than return
  // the first page as though it were all of it.
  if (collection.pagination?.nextPage) {
    throw new Error(
      `${attributes.url}?format=json is paginated, which retrieve doesn't handle`,
    );
  }

  const products = collection.items.map((item) => ({
    id: item.id,
    title: item.title,
    fullUrl: item.fullUrl,
    // When it went on sale, which find-events reads a year-less date from
    publishOn: item.publishOn,
    excerpt: item.excerpt,
    variants: (item.structuredContent?.variants || item.variants || []).map(
      ({ qtyInStock, unlimited }) => ({ qtyInStock, unlimited }),
    ),
  }));

  return { products };
}

module.exports = retrieve;

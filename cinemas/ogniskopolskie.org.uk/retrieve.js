const { fetchJson } = require("../../common/utils");
const { squareUserId, squareSiteId } = require("./attributes");

const PER_PAGE = 100;

// The store API the site's own shop pages call. `visibilities[]=visible` is
// what separates the current catalogue from the back catalogue: the sitemap
// still lists products from 2024 and 2025 that the shop no longer shows.
const getProductsUrl = (page) =>
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${squareUserId}` +
  `/sites/${squareSiteId}/products` +
  `?page=${page}&per_page=${PER_PAGE}&visibilities[]=visible`;

async function retrieve() {
  const products = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = getProductsUrl(page);
    const { data, meta } = await fetchJson(url);

    if (!Array.isArray(data)) {
      throw new Error(
        `No products returned from ${url} - the response shape may have changed`,
      );
    }

    products.push(...data);
    totalPages = meta?.pagination?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return { products };
}

module.exports = retrieve;

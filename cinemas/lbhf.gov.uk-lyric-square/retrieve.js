const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");
const { getListingView } = require("./utils");

async function retrieve() {
  return retrievePaginatedListView(getListingView());
}

module.exports = retrieve;

const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");
const { listingView } = require("./utils");

async function retrieve() {
  return retrievePaginatedListView(listingView);
}

module.exports = retrieve;
